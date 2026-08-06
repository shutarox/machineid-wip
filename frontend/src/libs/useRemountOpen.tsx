import * as React from 'react';

export const useRemountOnOpen = (isOpen: boolean, delay: number = 0) => {
  const [key, setKey] = React.useState(0);
  const [internalIsOpen, setInternalIsOpen] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setKey((k) => k + 1);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => setInternalIsOpen(true), delay);
      return () => clearTimeout(id);
    } else {
      setInternalIsOpen(false);
    }
  }, [delay, isOpen, key]);

  return { key, isOpen: internalIsOpen };
};
