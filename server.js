import { createServer } from 'node:http';

const PORT = Number(process.env.API_PORT ?? 8787);

const conversations = [
  {
    id: 1,
    name: 'ARMY Lounge',
    status: '5.2k active now',
    badge: 'Community',
    privacy: 'End-to-end encrypted',
    preview: 'Streaming party starts in 10 minutes.',
    unread: 3,
  },
  {
    id: 2,
    name: 'Bias Chat',
    status: 'Members online',
    badge: 'Private',
    privacy: 'Hidden read receipts',
    preview: 'Share your favorite stage photos here.',
    unread: 1,
  },
  {
    id: 3,
    name: 'Comeback Countdown',
    status: 'Pinned channel',
    badge: 'Secure',
    privacy: 'Forward secrecy enabled',
    preview: 'We need a final schedule for listening party.',
    unread: 0,
  },
];

const initialMessages = {
  1: [
    { id: 1, sender: 'Mina', text: 'Did everyone get the reminder for tonight?', time: '09:10' },
    { id: 2, sender: 'Jae', text: 'Yes — I shared the playlist link already.', time: '09:12' },
    { id: 3, sender: 'You', text: 'I can host the countdown room and keep it locked.', time: '09:14', mine: true },
  ],
  2: [
    { id: 1, sender: 'Sora', text: 'Please keep this thread invite-only.', time: '08:45' },
    { id: 2, sender: 'You', text: 'Confirmed. Messages stay private by default.', time: '08:47', mine: true },
  ],
  3: [
    { id: 1, sender: 'Hana', text: 'Drafted the comeback reminders and schedule.', time: '10:02' },
    { id: 2, sender: 'You', text: 'Perfect — I will pin the final version tonight.', time: '10:04', mine: true },
  ],
};

const createState = () => ({
  messagesByConversation: structuredClone(initialMessages),
});

let state = createState();

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'OPTIONS') {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/chat-state') {
    sendJson(response, 200, {
      conversations,
      messagesByConversation: state.messagesByConversation,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/chat-messages') {
    try {
      const body = await readJsonBody(request);
      const conversationId = Number(body.conversationId);
      const text = String(body.text ?? '').trim();

      if (!conversationId || !text) {
        sendJson(response, 400, { error: 'conversationId and text are required' });
        return;
      }

      const currentMessages = state.messagesByConversation[conversationId] ?? [];
      const nextMessage = {
        id: currentMessages.length + 1,
        sender: 'You',
        text,
        time: 'Now',
        mine: true,
      };

      state = {
        ...state,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...currentMessages, nextMessage],
        },
      };

      sendJson(response, 200, {
        conversations,
        messagesByConversation: state.messagesByConversation,
      });
    } catch {
      sendJson(response, 400, { error: 'Invalid request body' });
    }

    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/chat-reset') {
    state = createState();
    sendJson(response, 200, {
      conversations,
      messagesByConversation: state.messagesByConversation,
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chat API listening on http://localhost:${PORT}`);
});
