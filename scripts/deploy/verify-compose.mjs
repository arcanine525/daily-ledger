import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const project=process.env.DEPLOY_TEST_PROJECT??"ledger-phase4-20261008",origin=process.env.DEPLOY_TEST_ORIGIN??`http://127.0.0.1:${process.env.DEPLOY_TEST_PORT??"3300"}`;
assert.equal(new URL(origin).hostname,"127.0.0.1");assert.ok(project.startsWith("ledger-"));
const email="deployment@example.test",password="deployment-fixture-password";
let cookie="",csrf="";
async function api(path,method="GET",data){
  const response=await fetch(`${origin}${path}`,{method,headers:{origin,...(cookie?{cookie}:{}),...(csrf?{"x-csrf-token":csrf}:{}),"Content-Type":"application/json",...(method==="POST"?{"Idempotency-Key":"deployment-proof"}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(30000)});
  const value=await response.json();assert.ok(response.ok,`${path}: ${response.status} ${value.code??""}`);
  if(path==="/api/auth/login"){cookie=response.headers.get("set-cookie")?.split(";")[0]??"";csrf=value.csrfToken;}
  return value;
}
async function createOwner(){
  const child=spawn("docker",["compose","-f","compose.deploy-test.yaml","-p",project,"run","--rm","-T","ops","pnpm","admin:create-owner"],{stdio:["pipe","pipe","pipe"]});
  let output="",emailSent=false,passwordSent=false;
  child.stdout.on("data",chunk=>{output+=chunk.toString();if(!emailSent&&output.includes("Email:")){emailSent=true;child.stdin.write(`${email}\n`);}if(!passwordSent&&output.includes("Password (hidden):")){passwordSent=true;child.stdin.write(`${password}\n`);}});
  child.stderr.on("data",chunk=>process.stderr.write(chunk));
  const code=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("exit",resolve);});
  assert.equal(code,0);assert.ok(output.includes("Owner created."));assert.ok(!output.includes(password));
}

assert.equal((await api("/api/health/ready")).status,"ready");
await createOwner();await api("/api/auth/login","POST",{email,password});
const loginPage=await fetch(`${origin}/vi/login`);assert.equal(loginPage.status,200);
const html=await loginPage.text(),asset=html.match(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/u)?.[1];assert.ok(asset);assert.equal((await fetch(`${origin}${asset}`)).status,200);
const projectId=(await api("/api/projects","POST",{name:"Deployment fixture"})).id;
await api(`/api/projects/${projectId}/participants`,"POST",{displayName:"Mai",aliases:["Mai"],isSelf:true});
const profile=(await api("/api/providers","POST",{name:"Deployment mock",type:"openai-compatible",baseUrl:"http://mock-provider:3201/v1",model:"fixture",token:"fixture-only-token"})).id;
await api("/api/settings","PATCH",{analysisProfileId:profile,chatProfileId:profile});
const meeting=(await api("/api/meetings","POST",{projectId,title:"Deployment daily",occurredAt:"2026-10-08T02:00:00Z",meetingTimezone:"UTC",rawText:"Mai: I will review the API tomorrow.\nMai: Migration check."})).id;
const analysis=await api(`/api/meetings/${meeting}/analysis-runs`,"POST",{});
for(const stepKey of analysis.snapshot.steps)await api(`/api/analysis-runs/${analysis.id}/step`,"POST",{stepKey});
assert.equal((await api(`/api/analysis-runs/${analysis.id}`)).state,"COMPLETED");
const detail=await api(`/api/meetings/${meeting}`);assert.equal(detail.revisions.length,1);assert.equal(detail.analyses.length,1);
const proposal=detail.actions[0]?.proposals[0];assert.ok(proposal);
await api(`/api/task-proposals/${proposal.id}/decision`,"POST",{decision:"ACCEPT"});
const thread=(await api("/api/conversations","POST",{title:"Deployment chat"})).id,chat=await api(`/api/conversations/${thread}/messages`,"POST",{question:"Migration đang vướng gì?",filters:{projectId}});
for(const stepKey of ["plan","retrieve"])await api(`/api/chat-runs/${chat.id}/step`,"POST",{stepKey});
const stream=await fetch(`${origin}/api/chat-runs/${chat.id}/step`,{method:"POST",headers:{origin,cookie,"x-csrf-token":csrf,"Content-Type":"application/json"},body:JSON.stringify({stepKey:"answer"}),signal:AbortSignal.timeout(30000)});assert.equal(stream.status,200);const events=await stream.text();assert.ok(events.includes('"verified":true'));assert.ok(!events.includes("event: error"));
const messages=await api(`/api/conversations/${thread}/messages`);assert.equal(messages.at(-1)?.state,"complete");assert.ok(messages.at(-1)?.citations.length>0);assert.equal((await api(`/api/tasks?projectId=${projectId}`)).total,1);
process.stdout.write(JSON.stringify({projectId,meetingId:meeting,analysis:"COMPLETED",chat:"COMPLETED",staticAssets:true,ownerCli:true,canonicalTasks:1})+"\n");
