import { Global, Module } from '@nestjs/common';
import { SupabaseAdminProvider } from './supabase-admin.provider';

@Global()
@Module({
  providers: [SupabaseAdminProvider],
  exports: [SupabaseAdminProvider],
})
export class SupabaseModule {}
