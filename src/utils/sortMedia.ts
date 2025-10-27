
export interface Movie {
  type: string;
  title: string;
  score: number;
  date: string;
  comment: string;
  quote: string;
  cover: string;
  link: string;
  recommend: boolean;
  favorite: boolean;
  genre: string;
}

export const sortMoviesByDate = (media: Movie[]): Movie[] => {
  return media.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};