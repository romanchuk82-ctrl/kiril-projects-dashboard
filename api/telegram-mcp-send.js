export async function sendSavedMessage(client, value) {
  const message = String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!message) throw Object.assign(new Error('Message is empty'), { code: 'EMPTY_MESSAGE' });
  if (message.length > 12000) throw Object.assign(new Error('Message is too long'), { code: 'MESSAGE_TOO_LONG' });

  const chunks = [];
  let rest = message;
  while (rest.length > 3500) {
    let cut = rest.lastIndexOf('\n', 3500);
    if (cut < 1800) cut = rest.lastIndexOf(' ', 3500);
    if (cut < 1800) cut = 3500;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);

  const sent = [];
  for (const chunk of chunks) {
    const result = await client.sendMessage('me', { message: chunk });
    sent.push(Number(result?.id) || null);
  }
  return sent;
}
