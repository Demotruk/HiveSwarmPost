import { describe, it, expect } from 'vitest';
import { parseVouch } from '../src/hive/vouches.js';

describe('parseVouch', () => {
  it('parses "!vouch @creator" with @ prefix', () => {
    expect(parseVouch('!vouch @sagarkothari88')).toBe('sagarkothari88');
  });

  it('parses "!vouch creator" without @ prefix', () => {
    expect(parseVouch('!vouch littlenewthings')).toBe('littlenewthings');
  });

  it('parses vouch embedded in a longer comment', () => {
    expect(parseVouch(
      'Welcome to Hive! I can confirm this account was set up by @bob. !vouch @bob Good luck!'
    )).toBe('bob');
  });

  it('is case-insensitive on the command', () => {
    expect(parseVouch('!Vouch @alice')).toBe('alice');
  });

  it('normalises creator name to lowercase', () => {
    expect(parseVouch('!vouch @SomeUser')).toBe('someuser');
  });

  it('handles names with dots and hyphens', () => {
    expect(parseVouch('!vouch @my-user.name')).toBe('my-user.name');
  });

  it('returns null when no vouch present', () => {
    expect(parseVouch('Welcome to Hive!')).toBeNull();
  });

  it('returns null for malformed vouch with too-short name', () => {
    expect(parseVouch('!vouch @ab')).toBeNull();
  });

  it('returns null for bare "!vouch" with no account', () => {
    expect(parseVouch('!vouch')).toBeNull();
  });

  it('returns null for "!vouch" followed by newline only', () => {
    expect(parseVouch('!vouch\n')).toBeNull();
  });
});
