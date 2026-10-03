import { BaseCommand, type CommandContext } from './BaseCommand';
import { useDataService } from '@/stores/dataService';
import { useSystemStore } from '@/stores/system';
import { streamingGet } from '@/utils/streamingFetch';
import { buildSnapshot, type SnapshotRow } from './hopfetch/model';
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
      const rows: SnapshotRow[] = buildSnapshot(store.stats, hardware);
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
