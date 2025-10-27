
import { Languages } from 'lucide-react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

export function LanguageToggle() {
  const languages = [
    {
      name: 'English',
      code: 'en',
    },
    {
      name: 'Indonesian',
      code: 'id',
    },
  ];

  const getLocalizedUrl = (code: string) => {
    const path = window.location.pathname;
    const pathParts = path.split('/');
    const currentLocale = pathParts[1];

    if (languages.some(lang => lang.code === currentLocale)) {
      if (code === 'en') {
        // Switching to the default locale, so remove the locale from the path
        pathParts.splice(1, 1);
        return pathParts.join('/') || '/';
      } else {
        pathParts[1] = code;
        return pathParts.join('/');
      }
    } else {
      // We are on the default locale, so we are switching to a non-default locale
      if (path === '/') {
        return `/${code}`;
      }
      return `/${code}${path}`;
    }
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
