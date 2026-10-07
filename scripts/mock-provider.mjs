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
    const wire=z.object({model:z.string(),messages:z.array(z.object({role:z.string(),content:z.string()}))}).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const text=wire.messages.find(message=>message.role==="user")?.content??"{}";
    const payload=JSON.parse(text);
    const data=payload.phase==="ping"?{ok:true}:payload.phase==="map"?{summary,items:typeof payload.text==="string"&&payload.text.includes(quote)?[{kind:"ACTION",title:"Review API",quote,segmentOrdinal:null,names:["Mai"],duePhrase:"tomorrow",completionScope:"NONE"}]:[]}:payload.phase==="reduce"?summary:{suggestions:[]};
    response.setHeader("Content-Type","application/json");response.end(JSON.stringify({choices:[{message:{content:JSON.stringify(data)},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:10}}));
  }catch{response.writeHead(400);response.end(JSON.stringify({error:"INVALID_FIXTURE_REQUEST"}));}
}).listen(3201,"127.0.0.1",()=>process.stdout.write("Deterministic mock provider listening on 127.0.0.1:3201\n"));
