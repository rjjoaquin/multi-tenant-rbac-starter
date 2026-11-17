const api = process.env.API_INTERNAL_URL || 'http://localhost:3001';
export default {
  async headers() { return [{ source: '/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'DENY' }] }]; },
  async rewrites() { return [{ source: '/api/:path*', destination: api + '/:path*' }]; },
};
