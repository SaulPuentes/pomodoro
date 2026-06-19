// Curated nature "views". Images are hot-linked from the Unsplash CDN per their
// guidelines (we never rehost). Each id is the photo's CDN slug.
export const VIEWS = [
  { id: '1490604001847-b712b0c2f967', name: 'Blue ridges' },
  { id: '1505765050516-f72dcac9c60e', name: 'Morning fog' },
  { id: '1441974231531-c6227db76b6e', name: 'Forest light' },
  { id: '1501785888041-af3ef285b470', name: 'Glacier lake' },
  { id: '1469474968028-56623f02e42e', name: 'Misty valley' },
  { id: '1447752875215-b2761acb3c5d', name: 'Boardwalk' },
  { id: '1418065460487-3e41a6c84dc5', name: 'Snow peaks' },
  { id: '1500534623283-312aade485b7', name: 'Golden hour' },
];

const CREDIT_URL = 'https://unsplash.com/?utm_source=open_window&utm_medium=referral';

export function photoUrl(id, { w = 1100, q = 72, h } = {}) {
  const crop = h ? `&h=${h}&fit=crop` : '&fit=max';
  return `https://images.unsplash.com/photo-${id}?auto=format&w=${w}&q=${q}${crop}`;
}

export function thumbUrl(id) {
  return photoUrl(id, { w: 200, h: 150, q: 45 });
}

// A background record is what we persist and apply.
export function curatedBackground(view) {
  return {
    type: 'curated',
    id: view.id,
    name: view.name,
    url: photoUrl(view.id),
    credit: 'Unsplash',
    creditUrl: CREDIT_URL,
  };
}

export function defaultBackground() {
  return curatedBackground(VIEWS[0]);
}

// Pull a fresh portrait nature photo from the live Unsplash API. Requires the
// user's own access key (entered in Settings).
export async function fetchRandomNature(accessKey) {
  const url =
    'https://api.unsplash.com/photos/random' +
    '?query=nature&orientation=portrait&content_filter=high';
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
  });
  if (!res.ok) {
    const reason = res.status === 401 ? 'That access key was rejected.' : `Unsplash returned ${res.status}.`;
    throw new Error(reason);
  }
  const data = await res.json();
  const raw = data?.urls?.raw || data?.urls?.regular;
  if (!raw) throw new Error('No photo came back. Try again.');
  return {
    type: 'unsplash',
    id: data.id,
    name: data.description || data.alt_description || 'From Unsplash',
    url: `${raw}${raw.includes('?') ? '&' : '?'}auto=format&w=1100&q=72&fit=max`,
    credit: data.user?.name ? `${data.user.name} · Unsplash` : 'Unsplash',
    creditUrl: data.links?.html
      ? `${data.links.html}?utm_source=open_window&utm_medium=referral`
      : CREDIT_URL,
  };
}
