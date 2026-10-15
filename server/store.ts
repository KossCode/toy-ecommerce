import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'data')

function filePath(name: string) {
  return path.join(dataDir, name)
}

export function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(filePath(name), 'utf8')) as T
}

export function writeJson(name: string, value: unknown) {
  writeFileSync(filePath(name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
