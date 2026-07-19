import { Module } from '@nestjs/common';
import { AzureLanguageService } from './azure-language.service';

/**
 * Wraps Azure AI Language (PHI redaction). Service-only, like LLMModule — no
 * persistence, pure transport to an external provider.
 */
@Module({
  providers: [AzureLanguageService],
  exports: [AzureLanguageService],
})
export class LanguageModule {}
