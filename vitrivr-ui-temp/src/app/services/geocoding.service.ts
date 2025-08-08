import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import KDBush from 'kdbush';
import { LoggingService } from './logging.service';

/**
 * Interface for a city object from cities.json
 */
export interface City {
  name: string;
  asciiname: string;
  alternatenames: string[];
  latitude: number;
  longitude: number;
  country?: string; // ISO country code
  population?: number;
  subdivision1?: string; // state/province
  subdivision2?: string; // county/district
}

/**
 * Interface for geocoding results
 */
export interface GeocodingResult {
  city: City;
  distance?: number; //in meters
}

/**
 * Service for geocoding and reverse geocoding using cities.json
 * Uses kdbush for efficient spatial indexing
 */
@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  private cities: City[] = [];
  private citiesIndex: KDBush | null = null;
  private citiesMap: Map<string, City> = new Map();
  private isLoaded = new BehaviorSubject<boolean>(false);

  constructor(
    private http: HttpClient,
    private loggingService: LoggingService
  ) {
    this.loadCities();
  }

  /**
   * Loads cities from cities.json and indexes them using kdbush
   */
  private loadCities(): void {
    this.loggingService.info('GeocodingService', 'Loading cities data');

    // This is used only for loading the data, then map it to the City interface
    interface CityJson {
      name: string;
      asciiname: string;
      alternatenames: string[];
      latitude: number;
      longitude: number;
      country_code?: string;
      population?: number;
      admin1_code?: string;
      admin2_code?: string;
    }

    this.http.get<CityJson[]>('assets/cities.json').pipe(
      tap(cities => {
        this.loggingService.info('GeocodingService', `Loaded ${cities.length} cities`);
      }),
      catchError(error => {
        this.loggingService.error('GeocodingService', 'Failed to load cities data', error);
        return of([]);
      })
    ).subscribe(citiesJson => {

      const cities: City[] = citiesJson.map(cityJson => ({
        name: cityJson.name,
        asciiname: cityJson.asciiname,
        alternatenames: cityJson.alternatenames,
        latitude: cityJson.latitude,
        longitude: cityJson.longitude,
        country: cityJson.country_code, // Map country_code to country
        population: cityJson.population,
        subdivision1: cityJson.admin1_code, // Map admin1_code to subdivision1
        subdivision2: cityJson.admin2_code, // Map admin2_code to subdivision2
      }));

      if (cities.length > 0) {
        const sampleCity = cities[0];
        this.loggingService.info('GeocodingService', 'Sample city after mapping', {
          name: sampleCity.name,
          country: sampleCity.country,
          subdivision1: sampleCity.subdivision1,
          subdivision2: sampleCity.subdivision2
        });
      }

      this.cities = cities;

      // Instantiate KDBush spatial index
      this.citiesIndex = new KDBush(cities.length);
      for (const city of cities) {
        this.citiesIndex.add(city.longitude, city.latitude);
      }
      this.citiesIndex.finish();


      //map for name based lookups
      cities.forEach((city: City) => {
        // Index by main name
        this.citiesMap.set(city.name.toLowerCase(), city);

        // Index by ASCII name if different
        if (city.asciiname && city.asciiname !== city.name) {
          this.citiesMap.set(city.asciiname.toLowerCase(), city);
        }

        // Index by alternate names
        if (city.alternatenames) {
          city.alternatenames.forEach((altName: string) => {
            if (altName && altName.length > 2) { // skip short alternate names
              this.citiesMap.set(altName.toLowerCase(), city);
            }
          });
        }

        // Index by subdivision1 if available
        if (city.subdivision1) {
          this.citiesMap.set(`${city.name.toLowerCase()}, ${city.subdivision1.toLowerCase()}`, city);

          // Also index by ASCII name with subdivision1 if different
          if (city.asciiname && city.asciiname !== city.name) {
            this.citiesMap.set(`${city.asciiname.toLowerCase()}, ${city.subdivision1.toLowerCase()}`, city);
          }
        }

        if (city.subdivision2) {
          this.citiesMap.set(`${city.name.toLowerCase()}, ${city.subdivision2.toLowerCase()}`, city);

          if (city.asciiname && city.asciiname !== city.name) {
            this.citiesMap.set(`${city.asciiname.toLowerCase()}, ${city.subdivision2.toLowerCase()}`, city);
          }

          // Index by full hierarchy if both subdivisions are available
          if (city.subdivision1) {
            this.citiesMap.set(`${city.name.toLowerCase()}, ${city.subdivision2.toLowerCase()}, ${city.subdivision1.toLowerCase()}`, city);

            // Also index by ASCII name with full hierarchy if different
            if (city.asciiname && city.asciiname !== city.name) {
              this.citiesMap.set(`${city.asciiname.toLowerCase()}, ${city.subdivision2.toLowerCase()}, ${city.subdivision1.toLowerCase()}`, city);
            }
          }
        }
      });

      this.isLoaded.next(true);
      this.loggingService.info('GeocodingService', 'Cities indexed successfully');
    });
  }

  /**
   * Waits for cities data to be loaded
   */
  public waitForLoad(): Observable<boolean> {
    return this.isLoaded.asObservable();
  }

  /**
   * Finds a city by name
   * @param cityName The name of the city to find
   * @returns The city object if found, null otherwise
   */
  public findCityByName(cityName: string): City | null {
    if (!cityName || cityName.trim() === '') {
      return null;
    }

    const normalizedName = cityName.toLowerCase().trim();
    return this.citiesMap.get(normalizedName) || null;
  }

  /**
   * Finds all cities with the exact same name
   * @param cityName The exact name of the cities to find
   * @returns Array of cities with the exact name
   */
  public findCitiesByExactName(cityName: string): City[] {
    if (!cityName || cityName.trim() === '') {
      return [];
    }

    const normalizedName = cityName.toLowerCase().trim();
    const results: City[] = [];
    const seen = new Set<string>();

    // First check if there's a direct match in the map
    const directMatch = this.citiesMap.get(normalizedName);
    if (directMatch) {
      //found a direct match, but there might be more cities with the same name

      // create unique ID for this city to avoid duplicates
      const cityId = `${directMatch.name}-${directMatch.latitude}-${directMatch.longitude}`;
      results.push(directMatch);
      seen.add(cityId);
    }

    for (const city of this.cities) {

      if (city.name.toLowerCase() === normalizedName ||
          city.asciiname.toLowerCase() === normalizedName) {

        const cityId = `${city.name}-${city.latitude}-${city.longitude}`;

        // Only add if we haven't seen this city before
        if (!seen.has(cityId)) {
          results.push(city);
          seen.add(cityId);
        }
      }

      // Also check alternate names
      if (city.alternatenames) {
        for (const altName of city.alternatenames) {
          if (altName.toLowerCase() === normalizedName) {

            const cityId = `${city.name}-${city.latitude}-${city.longitude}`;

            // Only add if we haven't seen this city before
            if (!seen.has(cityId)) {
              results.push(city);
              seen.add(cityId);
              break;
            }
          }
        }
      }

      // Check if this is a search with subdivision format: "city, subdivision"
      const commaIndex = normalizedName.indexOf(',');
      if (commaIndex > 0) {
        const cityPart = normalizedName.substring(0, commaIndex).trim();
        const subdivisionPart = normalizedName.substring(commaIndex + 1).trim();

        // Check if city name matches the city part
        if ((city.name.toLowerCase() === cityPart ||
             city.asciiname.toLowerCase() === cityPart) &&
            // And check if either subdivision1 or subdivision2 matches the subdivision part
            ((city.subdivision1 && city.subdivision1.toLowerCase() === subdivisionPart) ||
             (city.subdivision2 && city.subdivision2.toLowerCase() === subdivisionPart))) {

          const cityId = `${city.name}-${city.latitude}-${city.longitude}`;
          if (!seen.has(cityId)) {
            results.push(city);
            seen.add(cityId);
          }
        }
      }
    }

    return results;
  }

  /**
   * Finds cities that match a name, sorting by relevance.
   * Prioritizes matches on primary names over alternate names.
   * @param nameQuery The name to search for
   * @param limit Maximum number of results to return
   * @returns Array of matching cities, sorted by relevance.
   */
  public findCitiesByPartialName(nameQuery: string, limit: number = 10): City[] {
    if (!nameQuery || nameQuery.trim().length < 2) {
      return [];
    }

    const normalizedQuery = nameQuery.toLowerCase().trim();
    const results: { city: City; score: number }[] = [];
    const seen = new Set<string>();

    for (const city of this.cities) {
      const cityId = `${city.name}-${city.latitude}-${city.longitude}`;
      if (seen.has(cityId)) {
        continue;
      }

      let bestScore = 0;
      const normalizedName = city.name.toLowerCase();
      const normalizedAsciiName = city.asciiname.toLowerCase();

      // Exact match on a primary name (highest priority)
      if (normalizedName === normalizedQuery || normalizedAsciiName === normalizedQuery) {
        bestScore = 100;
      }
      //"Starts with" match on a primary name
      else if (normalizedName.startsWith(normalizedQuery) || normalizedAsciiName.startsWith(normalizedQuery)) {
        bestScore = 90;
      }

      // Check alternate names if no strong primary match was found
      if (bestScore < 90 && city.alternatenames) {
        for (const altName of city.alternatenames) {
          if (altName) {
            const normalizedAltName = altName.toLowerCase();
            if (normalizedAltName === normalizedQuery) {
              bestScore = Math.max(bestScore, 80); // Exact match on alternate name
            } else if (normalizedAltName.startsWith(normalizedQuery)) {
              bestScore = Math.max(bestScore, 70); // "Starts with" on alternate name
            }
          }
        }
      }

      // Substring matches (lowest priority)
      if (bestScore === 0) {
        if (normalizedName.includes(normalizedQuery) || normalizedAsciiName.includes(normalizedQuery)) {
          bestScore = 20; // Substring on primary name
        } else if (city.alternatenames && city.alternatenames.some(an => an && an.toLowerCase().includes(normalizedQuery))) {
          bestScore = 10; // Substring on alternate name
        }
      }

      if (bestScore > 0) {
        results.push({ city, score: bestScore });
        seen.add(cityId);
      }
    }

    // Sort results: first by the calculated score (relevance so to say), then by population as a tie-breaker
    results.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return (b.city.population ?? 0) - (a.city.population ?? 0); // Higher population first for ties
    });

    this.loggingService.info('GeocodingService', 'Sorted City Results:', results.slice(0, limit));
    return results.slice(0, limit).map(r => r.city);
  }

  /**
   * Gets a formatted display name for a city including subdivisions if available
   * @param city The city object
   * @returns A formatted string with city name and subdivisions
   */
  public getFormattedCityName(city: City): string {
    if (!city) return '';

    const parts = [city.name];

    // Add subdivision2 if available (more specific, like county/district)
    if (city.subdivision2) {
      parts.push(city.subdivision2);
    }

    // Add subdivision1 if available (less specific, like state)
    if (city.subdivision1) {
      parts.push(city.subdivision1);
    }

    // Add country if available
    if (city.country) {
      parts.push(city.country);
    }

    return parts.join(', ');
  }

  /**
   * Finds the nearest city to a given coordinate
   * @param latitude Latitude coordinate
   * @param longitude Longitude coordinate
   * @returns The nearest city and its distance
   */
  public findNearestCity(latitude: number, longitude: number): GeocodingResult | null {
    if (!this.citiesIndex || this.cities.length === 0) {
      return null;
    }

    // Find the nearest city by searching in a radius and then calculating distances
    // (simulates a nearest-neighbor search)
    const searchRadiusDegrees = 0.5; // Search in a ~55km radius box
    const candidateIndices = this.citiesIndex.range(
      longitude - searchRadiusDegrees,
      latitude - searchRadiusDegrees,
      longitude + searchRadiusDegrees,
      latitude + searchRadiusDegrees
    );

    let nearestCity: City | null = null;
    let minDistance = Infinity;

    for (const index of candidateIndices) {
      const city = this.cities[index];
      const distance = this.calculateDistance(latitude, longitude, city.latitude, city.longitude);
      if (distance < minDistance) {
        minDistance = distance;
        nearestCity = city;
      }
    }

    if (nearestCity) {
      return { city: nearestCity, distance: minDistance };
    }

    return null;
  }

  /**
   * Finds cities within a given radius of a coordinate
   * @param latitude Latitude coordinate
   * @param longitude Longitude coordinate
   * @param radiusMeters Radius in meters
   * @param limit Maximum number of results to return
   * @returns Array of cities within the radius, sorted by distance
   */
  public findCitiesWithinRadius(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    limit: number = 10
  ): GeocodingResult[] {
    if (!this.citiesIndex || this.cities.length === 0) {
      return [];
    }

    // Convert radius from meters to degrees (approximate)
    // 1 degree of latoitude approximately 111,000 meters
    const radiusDegrees = radiusMeters / 111000;

    // Use range query to find points within the bounding box
    const points = this.citiesIndex.range(
      longitude - radiusDegrees,
      latitude - radiusDegrees,
      longitude + radiusDegrees,
      latitude + radiusDegrees
    );

    // Filter points by actual distance and sort by distance
    const results: GeocodingResult[] = points
      .map((index: number) => {
        const city = this.cities[index];
        const distance = this.calculateDistance(
          latitude, longitude,
          city.latitude, city.longitude
        );
        return { city, distance };
      })
      .filter((result: GeocodingResult) => result.distance! <= radiusMeters)
      .sort((a: GeocodingResult, b: GeocodingResult) => a.distance! - b.distance!);

    // Limit the number of results
    return results.slice(0, limit);
  }

  /**
   * Calculates the distance between two coordinates in meters
   * Uses the Haversine formula
   */
  private calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon/2) * Math.sin(dLon/2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    return distance;
  }

  /**
   * Converts degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * Math.PI / 180;
  }
}
