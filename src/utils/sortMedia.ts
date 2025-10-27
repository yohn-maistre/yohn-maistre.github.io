
export interface Media {
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

export const sortMediaByDate = (media: Media[]): Media[] => {
  return media.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};