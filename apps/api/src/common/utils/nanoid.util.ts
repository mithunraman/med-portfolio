import { customAlphabet } from 'nanoid';

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const nanoidAlphanumeric = customAlphabet(ALPHANUMERIC, 21);
