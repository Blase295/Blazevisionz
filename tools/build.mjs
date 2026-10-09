import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'script.js', 'admin.html', 'admin.js', 'client.html', 'client.js', '_headers']) {
  await copyFile(file, `dist/${file}`);
}
