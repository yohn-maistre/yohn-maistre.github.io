
import { z } from 'astro/zod';

const MovieSchema = z.object({
  Title: z.string(),
  Year: z.string(),
  Rated: z.string(),
  Released: z.string(),
  Runtime: z.string(),
  Genre: z.string(),
  Director: z.string(),
  Writer: z.string(),
  Actors: z.string(),
  Plot: z.string(),
  Language: z.string(),
  Country: z.string(),
  Awards: z.string(),
  Poster: z.string().url(),
  Ratings: z.array(z.object({
    Source: z.string(),
    Value: z.string(),
  })),
  Metascore: z.string(),
  imdbRating: z.string(),
  imdbVotes: z.string(),
  imdbID: z.string(),
  Type: z.string(),
  DVD: z.string().optional(),
  BoxOffice: z.string().optional(),
  Production: z.string().optional(),
  Website: z.string().optional(),
  Response: z.string(),
});

const BookSchema = z.object({
  title: z.string(),
  author_name: z.array(z.string()).optional(),
  first_publish_year: z.number().optional(),
  cover_i: z.number().optional(),
});

export async function getMovieDetails(title: string) {
  const apiKey = import.meta.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error('TMDB_API_KEY is not set in your environment variables.');
    return null;
  }
  try {
    const searchResponse = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(title)}`);
    const searchData = await searchResponse.json();
    if (searchData.results && searchData.results.length > 0) {
      const movie = searchData.results[0];
      return {
        cover: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
        rating: movie.vote_average,
      };
    }
  } catch (error) {
    console.error(`Error fetching movie details for "${title}":`, error);
  }
  return null;
}

export async function getBookDetails(title: string, author?: string) {
  try {
    let query = `q=${encodeURIComponent(title)}`;
    if (author) {
      query += `&author=${encodeURIComponent(author)}`;
    }
    const response = await fetch(`https://openlibrary.org/search.json?${query}`);
    const data = await response.json();
    if (data.docs.length > 0) {
      const book = BookSchema.parse(data.docs[0]);
      return {
        cover: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : '',
      };
    }
  } catch (error) {
    console.error(`Error fetching book details for "${title}":`, error);
  }
  return null;
}
