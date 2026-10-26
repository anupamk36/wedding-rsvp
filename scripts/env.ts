// Load .env, .env.local etc. the same way Next.js does, so scripts and the app agree.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
