import { performance } from "perf_hooks";
import supertest, { SuperTest } from "supertest";
import { buildApp } from "./app";
var async = require("async");

const app = supertest(buildApp());
async function basicLatencyTest() {
    await app.post("/reset").expect(204);
    const start = performance.now();
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    console.log(`Latency: ${performance.now() - start} ms`);
}
async function bugTest() {
    
    await app.post("/reset").send({
        account: "account"
    }).expect(204);

    var count = 0;
    var body = { isAuthorized: true, remainingBalance: 0, charges: 100 };
    async.times(10, async function(){
        const app = supertest(buildApp());
        var resp1 = await app.post("/charge").send({
            charges: 100
        }).expect(200);
        
        if(JSON.stringify(resp1.body) === JSON.stringify(body) ){
            ++count;
        }
    }, function(){
        console.assert(count == 1, `Number of authorized requests should be 1 but was ${count}`);
    });  
}

async function runTests() {
    await basicLatencyTest();
    await bugTest();
}

runTests().catch(console.error);
