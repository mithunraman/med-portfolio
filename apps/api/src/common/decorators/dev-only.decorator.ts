import { SetMetadata } from '@nestjs/common';

export const IS_DEV_ONLY_KEY = 'isDevOnly';
export const DevOnly = () => SetMetadata(IS_DEV_ONLY_KEY, true);
