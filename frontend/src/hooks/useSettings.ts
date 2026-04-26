import { useState } from 'react'
import type { Settings } from '../types.ts'
import { DEFAULT_SETTINGS } from '../types.ts'

const STORAGE_KEY = 'blossom:settings'

export function useSettings() {
    const [settings, setSettings] = useState<Settings>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
        } catch { /* ignore */ }
        return DEFAULT_SETTINGS
    })

    const save = (next: Settings) => {
        setSettings(next)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }

    return { settings, save }
}
