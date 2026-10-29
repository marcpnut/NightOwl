import { createDemoServer } from './demo.js';

const app = createDemoServer();
app.listen({ host: '127.0.0.1', port: 8080 }).then(() => {
  process.stdout.write('StreamCinema local demo: http://127.0.0.1:8080/?demo=1\n');
}).catch((error) => { console.error(error); process.exitCode = 1; });
