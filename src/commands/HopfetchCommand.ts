import { BaseCommand, type CommandContext } from './BaseCommand';
import { useDataService } from '@/stores/dataService';
import { useSystemStore } from '@/stores/system';
import { streamingGet } from '@/utils/streamingFetch';
import { buildSnapshot, record, list, type SnapshotRow } from './hopfetch/model';
import { ApiService } from '@/utils/api';
import { renderSnapshot } from './hopfetch/renderer';

export class HopfetchCommand extends BaseCommand {
  name = 'hopfetch';
  aliases = ['fastfetch'];
  description = 'Show a read-only node, host, radio and sensor snapshot';
  usage = 'hopfetch [--plain] [help|--help]';

  async execute({ term, args, writePrompt, signal }: CommandContext): Promise<void> {
    if (signal?.aborted) return;
    try {
      if (args.some((arg) => !['--plain', 'help', '--help'].includes(arg))) {
        term.writeln(`Unknown argument. Usage: ${this.usage}`);
        return;
      }
      if (args.includes('help') || args.includes('--help')) {
        term.writeln(this.usage);
        term.writeln(
          'One snapshot using cached/managed stats and hardware stats; no polling or modem probes.',
        );
        term.writeln(
          'Configured radios are not necessarily connected. Unknown data is not guessed.',
        );
        return;
      }
      const store = useSystemStore();
      const dataService = useDataService();
      const [statsResult, hwResult] = await Promise.allSettled([
        dataService.ensure('stats'),
        streamingGet('/hardware_stats', undefined, { signal }),
      ]);
      if (signal?.aborted) return;
      const hardware =
        hwResult.status === 'fulfilled' && hwResult.value.success ? hwResult.value.data : null;
      const stats = record(store.stats);
      const config = record(stats.config);
      const radios = list(stats.radios).length ? list(stats.radios) : list(config.radios);
      const needsCatalogue = (
        radios.length ? radios : [stats.radio_type !== undefined ? stats : config]
      ).some(
        (radio) =>
          radio.enabled !== false && ['sx1262', 'sx1262_ch341'].includes(String(radio.radio_type)),
      );
      let options: unknown = [];
      if (needsCatalogue) {
        try {
          const result = record(await ApiService.get('hardware_options', undefined, { signal }));
          options =
            result.hardware ??
            (result.success && Array.isArray(result.data)
              ? result.data
              : record(result.data).hardware) ??
            [];
        } catch {
          /* Catalogue unavailable: report unknown, never guess the board. */
        }
      }
      if (signal?.aborted) return;
      const rows: SnapshotRow[] = buildSnapshot(store.stats, hardware, Date.now(), options);
      if (statsResult.status === 'rejected')
        rows.push({ label: 'Stats', value: 'refresh unavailable; cached data if present' });
      if (!hardware) rows.push({ label: 'Hardware', value: 'unavailable' });
      for (const line of renderSnapshot(rows, {
        cols: term.cols,
        rows: term.rows,
        plain: args.includes('--plain'),
      })) {
        if (signal?.aborted) return;
        term.writeln(line);
      }
    } finally {
      if (!signal?.aborted) writePrompt();
    }
  }
}
