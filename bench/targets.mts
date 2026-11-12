import type { Scenario } from '../apps/shared/config.mjs';

export interface Target {
  name: string;
  entry: string;
  packages: readonly string[];
  scenarios: readonly Scenario[];
}

function target(name: string, file: string, packages: string[], requestScoped = false): Target {
  return {
    name,
    entry: new URL(`../apps/${file}.mjs`, import.meta.url).href,
    packages,
    scenarios: requestScoped ? ['perRoute', 'perRequest'] : ['perRoute'],
  };
}

// Only paths are registered here. Importing this manifest never loads a framework.
export const targets: readonly Target[] = [
  target('node', 'node', []),
  target('express', 'express', ['express']),
  target('koa', 'koa', ['koa', '@koa/router']),
  target('fastify', 'fastify', ['fastify']),
  target('hapi', 'hapi', ['@hapi/hapi']),
  target('holu', 'holu/main', ['@holu/core', '@holu/rest'], true),
  target('nestjs-node', 'nestjs/node', ['@nestjs/common', '@nestjs/core', '@nestjs/platform-node'], true),
  target(
    'nestjs-express',
    'nestjs/express',
    ['@nestjs/common', '@nestjs/core', '@nestjs/platform-express', 'express'],
    true,
  ),
  target(
    'nestjs-fastify',
    'nestjs/fastify',
    ['@nestjs/common', '@nestjs/core', '@nestjs/platform-fastify', 'fastify'],
    true,
  ),
];

export function findTarget(name: string): Target {
  const found = targets.find((item) => item.name === name);
  if (!found) throw new Error(`Unknown framework: ${name}. Choose: ${targets.map((item) => item.name).join(', ')}`);
  return found;
}
