import express from "express";
import { WatchError, createClient } from "redis";
import { json } from "body-parser";

const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

class TimeoutError extends Error {
    constructor(msg: string) {
        super(msg);
    }
}

async function connect(): Promise<ReturnType<typeof createClient>> {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    console.log(`Using redis URL ${url}`);
    const client = createClient({ url });
    await client.connect();
    return client;
}

async function reset(account: string): Promise<void> {
    const client = await connect();
    try {
        await client.set(`${account}/balance`, DEFAULT_BALANCE);
    } finally {
        await client.disconnect();
    }
}
function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
async function chargeSafe(account: string, charges: number, timeout: number): Promise<ChargeResult> {
    const start = performance.now();
    var retry = true;
    var waitTimeout = 50;
    let exponent = 1.6;
    while(retry) {
        retry = false;
        try{
           var result = await charge(account, charges);
           return result;
        } catch(err) {
            if (err instanceof WatchError && performance.now() - start < timeout) {
                retry = true;
                delay(waitTimeout);
                waitTimeout *= exponent;
            } else {
                throw err;
            }
        }
    }
    return { isAuthorized: false, remainingBalance: 0, charges: 0 };
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    
    const client = await connect();
    try {

        client.watch(`${account}/balance`);

        const balance = parseInt((await client.get(`${account}/balance`)) ?? "");
        if (balance >= charges) {
            await client.multi().set(`${account}/balance`, balance - charges).exec();
            client.unwatch();
            const remainingBalance = parseInt((await client.get(`${account}/balance`)) ?? "");
            return { isAuthorized: true, remainingBalance, charges };
        } else {
            return { isAuthorized: false, remainingBalance: balance, charges: 0 };
        }
    } finally {
        await client.disconnect();
    }
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await chargeSafe(account, req.body.charges ?? 10, 2000);
            console.log(`Successfully charged account ${account}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}
