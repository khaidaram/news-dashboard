/// <reference types="bun-types" />
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Store persisted results in backend/data/ relative to this file's directory
const DATA_DIR = join(import.meta.dir, '..', '..', 'data')

async function ensureDir(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true })
}

export async function persistGet<T>(key: string): Promise<T | null> {
    try {
        const content = await readFile(join(DATA_DIR, `${key}.json`), 'utf-8')
        return JSON.parse(content) as T
    } catch {
        return null
    }
}

export async function persistSet<T>(key: string, data: T): Promise<void> {
    try {
        await ensureDir()
        await writeFile(join(DATA_DIR, `${key}.json`), JSON.stringify(data, null, 2), 'utf-8')
        console.log(`[persist] saved ${key}`)
    } catch (e) {
        console.error(`[persist] failed to write ${key}:`, e)
    }
}
