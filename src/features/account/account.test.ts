import { describe, expect, it } from 'vitest';
import { loginOutcome, toAccount } from '@/features/account/account';
import { googleUser, kakaoUser, USER_IDS } from '@/test/supabase';

describe('toAccount', () => {
  it('takes the name and photo the provider gave, asking for an https photo', () => {
    expect(toAccount(kakaoUser('김여행'))).toEqual({
      id: USER_IDS.kakao,
      name: '김여행',
      avatarUrl: 'https://k.kakaocdn.net/dn/profile.jpg',
      provider: 'kakao',
    });
    expect(toAccount(googleUser('Jane Doe'))).toMatchObject({
      name: 'Jane Doe',
      avatarUrl: 'https://lh3.googleusercontent.com/a/photo',
      provider: 'google',
    });
  });

  it('falls back when the profile is thin', () => {
    const person = kakaoUser();
    expect(
      toAccount({
        ...person,
        user_metadata: { name: '  ', picture: 'https://example.com/me.png' },
        app_metadata: { provider: 'github' },
      }),
    ).toEqual({ id: person.id, name: '이름 없음', avatarUrl: 'https://example.com/me.png', provider: null });
    expect(
      toAccount({ ...person, user_metadata: { preferred_username: '여행자', avatar_url: 'data:x' } }),
    ).toMatchObject({ name: '여행자', avatarUrl: null });
  });
});

describe('loginOutcome', () => {
  it('reads how the login the page came back from ended', () => {
    expect(loginOutcome('?error=access_denied&error_description=User+denied+access')).toBe('cancelled');
    // Supabase turned the login down.
    expect(
      loginOutcome('?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed'),
    ).toBe('failed');
    expect(loginOutcome('?error=server_error&error_code=unexpected_failure')).toBe('failed');
    // A code the client didn't trade for a session.
    expect(loginOutcome('?code=abc')).toBe('failed');
    expect(loginOutcome('')).toBeNull();
    expect(loginOutcome('?day=inbox')).toBeNull();
  });
});
