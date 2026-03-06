import { useState } from 'react'
import { Settings as SettingsIcon, X, MapPin, RefreshCw } from 'lucide-react'
import type { Settings } from '../types.ts'

interface Props {
    settings: Settings
    onSave: (s: Settings) => void
    onClose: () => void
}

export function SettingsModal({ settings, onSave, onClose }: Props) {
    const [form, setForm] = useState<Settings>({ ...settings })

    const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }))

    const handleSave = () => {
        onSave(form)
        onClose()
    }

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal-header">
                    <span className="modal-title">
                        <SettingsIcon size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                        Settings
                    </span>
                    <button className="modal-close" onClick={onClose}><X size={16} /></button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label className="form-label">
                            <MapPin size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            City
                        </label>
                        <input
                            id="settings-city"
                            className="form-input"
                            value={form.city}
                            onChange={(e) => set('city', e.target.value)}
                            placeholder="Jakarta"
                        />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Country Code</label>
                            <input
                                id="settings-country"
                                className="form-input"
                                value={form.country}
                                onChange={(e) => set('country', e.target.value.toUpperCase())}
                                placeholder="ID"
                                maxLength={2}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                <RefreshCw size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                Refresh (sec)
                            </label>
                            <input
                                id="settings-refresh"
                                className="form-input"
                                type="number"
                                min={5}
                                max={300}
                                value={form.refreshInterval}
                                onChange={(e) => set('refreshInterval', parseInt(e.target.value) || 5)}
                            />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Latitude</label>
                            <input
                                id="settings-lat"
                                className="form-input"
                                type="number"
                                step="0.0001"
                                value={form.lat}
                                onChange={(e) => set('lat', parseFloat(e.target.value) || 0)}
                                placeholder="-6.2"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Longitude</label>
                            <input
                                id="settings-lon"
                                className="form-input"
                                type="number"
                                step="0.0001"
                                value={form.lon}
                                onChange={(e) => set('lon', parseFloat(e.target.value) || 0)}
                                placeholder="106.8"
                            />
                        </div>
                    </div>
                    <div className="form-hint" style={{ marginTop: 4 }}>
                        AI Intel Brief uses <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>OPENAI_API_KEY</code> from <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>backend/.env</code>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-outline" onClick={onClose}>Cancel</button>
                    <button id="settings-save" className="btn btn-primary" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    )
}
