import { createServer, type Server } from 'node:http';
import { Status, type Client } from 'discord.js';

// HTTP endpoint for external uptime monitoring (e.g. Uptime Robot). It reports
// 200 only while the gateway connection is live, so a failed probe means the bot
// lost its Discord connection or crashed, not merely that the host is reachable.
//
// A Discord bot listens on nothing of its own, so a TCP/ping check would only
// confirm the machine is up. This gives a monitor something that reflects the
// bot's actual ability to receive and answer messages.
export function startHealthServer(client: Client, port: number): Server {
  const server = createServer((_req, res) => {
    const ready = client.isReady() && client.ws.status === Status.Ready;
    if (ready) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`ok ping=${Math.round(client.ws.ping)}ms\n`);
    } else {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('unavailable: gateway not ready\n');
    }
  });

  server.on('error', (err) => {
    console.error('Health endpoint error:', err instanceof Error ? err.message : String(err));
  });

  server.listen(port, () => {
    console.log(`Health endpoint listening on :${port}`);
  });

  return server;
}
