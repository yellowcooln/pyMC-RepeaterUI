import { BaseCommand, type CommandContext } from './BaseCommand';
import ApiService from '@/utils/api';
import { waitForServiceRecovery } from '@/utils/restartRecovery';

interface RestartResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

export class RestartCommand extends BaseCommand {
  name = 'restart';
  description = 'Restart the pymc-repeater service';
  aliases = ['reboot'];

  matches(input: string): boolean {
    const lower = input.toLowerCase();
    return lower === 'restart' || lower === 'reboot';
  }

  async execute({ term, writePrompt }: CommandContext): Promise<void> {
    this.writeLine(term, '');
    this.writeLine(term, '\x1b[33m⚠️  This will restart the repeater service!\x1b[0m');
    this.writeLine(term, '');
    this.writeInfo(term, 'Attempting to restart service...');

    const stopLoading = this.startLoading(term, 'Restarting...');

    try {
      const response = await ApiService.post<RestartResponse>(
        '/restart_service',
        {},
        {
          timeout: 10000, // 10 second timeout
        },
      );

      stopLoading();

      if (response.success) {
        this.writeLine(term, '');
        this.writeSuccess(term, response.message || 'Service restart initiated');
        this.writeLine(term, '');
        const recovered = await this.waitForServiceRestart(term);
        if (!recovered) {
          this.writeLine(term, '');
          writePrompt();
        }
        return;
      } else {
        this.writeLine(term, '');
        this.writeError(
          term,
          'Restart failed: ' + (response.error || response.message || 'Unknown error'),
        );
        this.writeLine(term, '');
        this.writeInfo(
          term,
          'You may need to manually restart: sudo systemctl restart pymc-repeater',
        );
      }
    } catch (error: unknown) {
      stopLoading();
      this.writeLine(term, '');

      const err = error as { code?: string; message?: string; response?: { status?: number } };

      // Network errors (ECONNRESET, ERR_NETWORK, etc.) likely mean the service restarted successfully
      if (
        err.code === 'ERR_NETWORK' ||
        err.message?.includes('Network error') ||
        err.message?.includes('ECONNRESET') ||
        err.code === 'ECONNRESET'
      ) {
        this.writeSuccess(term, 'Service restart initiated successfully');
        this.writeLine(term, '');

        // Wait for service to come back up
        const recovered = await this.waitForServiceRestart(term);
        if (!recovered) {
          this.writeLine(term, '');
          writePrompt();
        }
        return;
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        // Timeout might mean service is restarting
        this.writeLine(term, '\x1b[33m⚠️  Request timed out - service may be restarting\x1b[0m');
        this.writeLine(term, '');
        const recovered = await this.waitForServiceRestart(term);
        if (!recovered) {
          this.writeLine(term, '');
          writePrompt();
        }
        return;
      } else if (err.response?.status === 403 || err.response?.status === 401) {
        this.writeError(term, 'Permission denied. Polkit rules may need configuration.');
        this.writeLine(term, '');
        this.writeInfo(
          term,
          "Run: sudo bash -c 'mkdir -p /etc/polkit-1/rules.d && cat > /etc/polkit-1/rules.d/10-pymc-repeater.rules <<EOF",
        );
        this.writeInfo(term, 'polkit.addRule(function(action, subject) {');
        this.writeInfo(term, '    if (action.id == "org.freedesktop.systemd1.manage-units" &&');
        this.writeInfo(term, '        action.lookup("unit") == "pymc-repeater.service" &&');
        this.writeInfo(term, '        subject.user == "repeater") { return polkit.Result.YES; }');
        this.writeInfo(term, '});');
        this.writeInfo(term, "EOF'");
      } else {
        this.writeError(term, 'Restart failed: ' + (err.message || 'Unknown error'));
        this.writeLine(term, '');
        this.writeInfo(term, 'Try manually: sudo systemctl restart pymc-repeater');
      }
    }

    this.writeLine(term, '');
    writePrompt();
  }

  private async waitForServiceRestart(term: any): Promise<boolean> {
    this.writeInfo(term, 'Service restart initiated...');
    this.writeLine(term, '');
    term.write('\r\x1b[36m⏳\x1b[0m Waiting for the service to come back...');

    const recovered = await waitForServiceRecovery({
      endpoint: `${window.location.protocol}//${window.location.host}/api/stats`,
      initialDelayMs: 4000,
      intervalMs: 1000,
      timeoutMs: 60000,
      stableResponsesRequired: 3,
      isReady: (response) => response.status < 500,
    });

    term.write('\r\x1b[K');
    this.writeLine(term, '');

    if (recovered) {
      this.writeSuccess(term, 'Service is back online. Reloading page...');
      this.writeLine(term, '');
      setTimeout(() => {
        window.location.reload();
      }, 750);
      return true;
    }

    this.writeLine(term, '\x1b[33m⚠️  Service did not respond within 60 seconds\x1b[0m');
    this.writeLine(term, '');
    this.writeInfo(term, 'The service may still be starting. Try reloading the page manually.');
    return false;
  }
}
