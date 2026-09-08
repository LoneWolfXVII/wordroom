import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlayerSettings } from '@wordroom/shared'
import { normalizeSettings } from './settings'

/**
 * Where `players.settings` is read and written.
 *
 * `authenticated` has `grant update (settings) on public.players` and a policy
 * limiting it to its own row, so this is the whole of the write surface — a
 * player can change their own configuration and nothing else. Names in
 * particular are locked by a trigger and are not reachable from here.
 */
export interface SettingsSource {
  load(playerId: string): Promise<PlayerSettings>
  save(playerId: string, settings: PlayerSettings): Promise<void>
}

export function createSettingsSource(client: SupabaseClient): SettingsSource {
  return {
    async load(playerId: string): Promise<PlayerSettings> {
      const { data, error } = await client
        .from('players')
        .select('settings')
        .eq('id', playerId)
        .maybeSingle()

      if (error) throw new Error(error.message)
      // `settings` is jsonb, so whatever comes back is genuinely unknown.
      const raw =
        data === null || typeof data !== 'object' ? null : (data as { settings?: unknown })
      return normalizeSettings(raw?.settings)
    },

    async save(playerId: string, settings: PlayerSettings): Promise<void> {
      const { error } = await client.from('players').update({ settings }).eq('id', playerId)
      if (error) throw new Error(error.message)
    },
  }
}
