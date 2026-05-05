import { describe, it, expect } from 'vitest';
import { parseVouch, parseSponsor } from '../src/hive/vouches.js';

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

describe('parseSponsor', () => {
  it('detects "!sponsor" in a comment', () => {
    expect(parseSponsor('!sponsor')).toBe(true);
  });

  it('detects "!sponsor" embedded in text', () => {
    expect(parseSponsor('Welcome to Hive! !sponsor I will help you get started.')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(parseSponsor('!Sponsor')).toBe(true);
    expect(parseSponsor('!SPONSOR')).toBe(true);
  });

  it('returns false when no sponsor present', () => {
    expect(parseSponsor('Welcome to Hive!')).toBe(false);
  });

  it('does not match "!sponsoring" or "!sponsored"', () => {
    expect(parseSponsor('I am !sponsoring this user')).toBe(false);
    expect(parseSponsor('This user is !sponsored')).toBe(false);
  });

  it('matches "!sponsor" at end of string', () => {
    expect(parseSponsor('I will support this account !sponsor')).toBe(true);
  });

  it('does not match vouch as sponsor', () => {
    expect(parseSponsor('!vouch @creator')).toBe(false);
  });
});

describe('vouch vs sponsor precedence', () => {
  it('vouch is not detected as sponsor', () => {
    expect(parseSponsor('!vouch @alice')).toBe(false);
    expect(parseVouch('!sponsor')).toBeNull();
  });

  it('comment with both commands: vouch parses the creator, sponsor detects presence', () => {
    const body = '!vouch @alice and also !sponsor';
    expect(parseVouch(body)).toBe('alice');
    expect(parseSponsor(body)).toBe(true);
  });
});
