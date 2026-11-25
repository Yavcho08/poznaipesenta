// Зарежда .env.local и .env като Next.js (.env.local е с предимство). Импортирай го първи в скриптовете.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
