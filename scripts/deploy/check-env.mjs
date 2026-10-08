import "dotenv/config";
import { parseEnvironment } from "../../src/server/env.ts";
parseEnvironment(process.env);
process.stdout.write("Server environment validated.\n");
