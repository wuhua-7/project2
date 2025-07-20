export const createTheme = (primary: string, mode: 'light' | 'dark') => ({
  primary,
  background: mode === 'dark' ? '#121212' : '#fff',
  card: mode === 'dark' ? '#222' : '#f5f5f5',
  text: mode === 'dark' ? '#fff' : '#222',
  border: mode === 'dark' ? '#333' : '#e0e0e0',
  input: mode === 'dark' ? '#222' : '#fafafa',
  emojiPanel: mode === 'dark' ? '#222' : '#fff',
  reaction: mode === 'dark' ? '#333' : '#eee',
  reactionActive: '#ffd966',
}); 