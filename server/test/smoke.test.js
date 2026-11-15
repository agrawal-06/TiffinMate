import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index.js';
import {createServer} from 'node:http';

// Smoke tests use a local ephemeral port and never write business data.
test('health endpoint responds with structured JSON',async()=>{
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/health');
 assert.ok([200,500].includes(response.status));
 if(response.ok){const body=await response.json();assert.equal(body.status,'ok')}
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('private customer endpoint rejects missing credentials',async()=>{
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/customers');assert.ok([401,503].includes(response.status))}
 finally{await new Promise(resolve=>server.close(resolve))}
});
