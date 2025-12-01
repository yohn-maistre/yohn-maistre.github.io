
import { Languages } from 'lucide-react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

// Import our i18n utilities
import { getLocalizedPath, parseContentUrl, getContentPath } from '@/lib/i18n-utils';

export function LanguageToggle() {
  const languages = [
    {
      name: 'English',
      code: 'en',
    },
    {
      name: 'Bahasa Indonesia',
      code: 'id',
    },
  ];

  const getLocalizedUrl = (targetLocale: string) => {
    const pathname = window.location.pathname;
    const defaultLocale = 'en';
    
    // Parse content URL
    const contentInfo = parseContentUrl(pathname);
    
    if (contentInfo) {
      // For content pages (blog/mind-garden), build the URL
      // Note: Content might not exist in target locale, will 404 gracefully
      const contentUrl = getContentPath(
        contentInfo.collection, 
        contentInfo.slug, 
        targetLocale, 
        defaultLocale
      );
      return contentUrl;
    }
    
    // For regular pages
    const pathParts = pathname.split('/').filter(Boolean);
    const hasLocalePrefix = pathParts.length > 0 && languages.some(lang => lang.code === pathParts[0]);
    
    let basePath: string;
    if (hasLocalePrefix) {
      basePath = '/' + pathParts.slice(1).join('/');
    } else {
      basePath = pathname;
    }
    
    if (basePath === '' || basePath === '/') {
      basePath = '/';
    } else {
      // Remove trailing slash for consistent comparison
      basePath = basePath.replace(/\/$/, '');
    }
    
    // Check if this page exists in Indonesian
    // Known Indonesian pages - all main pages now exist
    const indonesianPages = ['/', '/archives', '/blog', '/mind-garden', '/tags', '/about', '/projects', '/media', '/links', '/search'];
    
    // If switching to Indonesian and page doesn't exist, fallback to homepage
    if (targetLocale !== defaultLocale && !indonesianPages.includes(basePath)) {
      console.log('[LanguageToggle] Page not in indonesianPages, redirecting to homepage. basePath:', basePath);
      return getLocalizedPath('/', targetLocale, defaultLocale);
    }
    
    const finalUrl = getLocalizedPath(basePath, targetLocale, defaultLocale);
    console.log('[LanguageToggle] Regular page - basePath:', basePath, 'targetLocale:', targetLocale, 'finalUrl:', finalUrl);
    return finalUrl;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Languages className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Toggle language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => (window.location.href = getLocalizedUrl(lang.code))}
          >
            {lang.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
