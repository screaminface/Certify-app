import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'bg' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('spi.language');
    if (saved === 'bg' || saved === 'en') {
      return saved;
    }
    
    // Auto-detect Bulgarian from browser/system locale
    const browserLang = navigator.language || navigator.languages?.[0] || 'en';
    const isBulgarian = browserLang.toLowerCase().startsWith('bg');
    return isBulgarian ? 'bg' : 'en';
  });

  const [translations, setTranslations] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadTranslations = async () => {
      const module = await import(`../locales/${language}.ts`);
      setTranslations(module.default);
    };
    loadTranslations();
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('spi.language', lang);
  };

  const t = (key: string, params?: Record<string, string>): string => {
    let text = translations[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        text = text.replace(`{${paramKey}}`, paramValue);
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
