import { createServer } from "node:http";
import { z } from "zod";

const summary={overview:"Deterministic fixture summary",byPerson:[],blockers:[],decisions:[],todos:[]};
const quote="Mai: I will review the API tomorrow.";
createServer(async(request,response)=>{
  if(request.url==="/health"){response.end("ok");return;}
  if(request.method!=="POST"||request.url!=="/v1/chat/completions"){response.writeHead(404);response.end();return;}
  const chunks=[];let bytes=0;
  for await(const chunk of request){bytes+=chunk.length;if(bytes>3*1024*1024){response.writeHead(413);response.end();return;}chunks.push(chunk);}
  try{
    const wire=z.object({model:z.string(),stream:z.boolean().optional(),messages:z.array(z.object({role:z.string(),content:z.string()}))}).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const text=wire.messages.find(message=>message.role==="user")?.content??"{}";
    const payload=JSON.parse(text);
    const data=payload.phase==="chat-plan"?{intent:payload.question.includes("Summarize")?"MEETING_SUMMARY":payload.question.includes("tasks")?"LIST_TASKS":"LOOKUP",englishQuery:"migration",clarification:null,asOf:null}:payload.phase==="chat-map"?{text:"Fixture summary",sourceIds:payload.sources.map(source=>source.id).slice(0,12)}:payload.phase==="chat-reduce"?{text:"Fixture combined",sourceIds:payload.summaries.flatMap(value=>value.sourceIds).slice(0,12)}:payload.phase==="chat-answer"?{text:"Migration evidence found",citations:payload.sources.slice(0,1).map(source=>({sourceId:source.id,quote:source.text}))}:payload.phase==="ping"?{ok:true}:payload.phase==="map"?{summary,items:typeof payload.text==="string"&&payload.text.includes(quote)?[{kind:"ACTION",title:"Review API",quote,segmentOrdinal:null,names:["Mai"],duePhrase:"tomorrow",completionScope:"NONE"}]:[]}:payload.phase==="reduce"?summary:{suggestions:[]};
    if(wire.stream){response.setHeader("Content-Type","text/event-stream");const json=JSON.stringify(data);for(let index=0;index<json.length;index+=17)response.write(`data: ${JSON.stringify({choices:[{delta:{content:json.slice(index,index+17)},finish_reason:null}]})}\n\n`);response.end(`data: ${JSON.stringify({choices:[{delta:{},finish_reason:"stop"}]})}\n\ndata: [DONE]\n\n`);return;}
    response.setHeader("Content-Type","application/json");response.end(JSON.stringify({choices:[{message:{content:JSON.stringify(data)},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:10}}));
  }catch{response.writeHead(400);response.end(JSON.stringify({error:"INVALID_FIXTURE_REQUEST"}));}
}).listen(3201,process.env.MOCK_PROVIDER_HOST??"127.0.0.1",()=>process.stdout.write("Deterministic mock provider listening on port3201\n"));
