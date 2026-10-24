import { useEffect } from 'react';

export default function usePageTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · AI Resume Tailor` : 'AI Resume Tailor';
    return () => {
      document.title = previous;
    };
  }, [title]);
}
