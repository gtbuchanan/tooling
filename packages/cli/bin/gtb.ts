#!/usr/bin/env node
import { runMain } from 'citty';
import { main } from '../src/commands/index.ts';

await runMain(main);
