#!/usr/bin/env node
import { commands } from '../src/commands/index.ts';

const argvOffset = 2;
const [name, ...args] = process.argv.slice(argvOffset);

if (name === undefined || name === '--help' || name === '-h') {
  const available = Object.keys(commands).join(', ');
  console.log(`Usage: gtb <command> [...args]\n\nCommands: ${available}`);
} else {
  const command = commands[name];
  if (command === undefined) {
    throw new Error(`Unknown command: ${name}`);
  }
  await command(args);
}
