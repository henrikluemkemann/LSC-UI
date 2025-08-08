import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { LoggingService } from './logging.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

/**
 * Interface for the Vitrivr query structure
 *
 * @property inputs The input parameters for the query
 * @property operations The operations to perform on the inputs
 * @property output The identifier of the operation that produces the final result
 * @property context Additional context information for the query
 */
export interface VitrivrQuery {
  inputs: { [key: string]: any };
  operations: { [key: string]: any };
  output: string;
  context: any;
}

/**
 * Type representing different kinds of spatial queries
 *
 * Supports three types of spatial queries:
 * - circle: A circular area defined by a center point and radius
 * - city: A circular area around a named city with a radius
 * - bbox: A bounding box defined by top right (northeast) and bottom left (southwest) corners
 * - null: No spatial query
 */
export type SpatialQuery =
  | { type: 'circle'; data: { center: L.LatLng; radius: number }; displayData?: { locationName: string; countryCode: string; subdivision1?: string; subdivision2?: string; } }
  | { type: 'city'; data: { name: string; radius: number } }
  | { type: 'bbox'; data: { northEast: L.LatLng; southWest: L.LatLng } }
  | null;

/**
 * Service for building and executing queries to the Vitrivr backend
 *
 * This service handles the construction of query objects based spatiotemporal search criteria,
 * and communicates with the vitrivr-engine backend API to
 * execute these queries. It supports various types of spatial queries
 * (circle, city, bounding box) and temporal range filtering.
 */
@Injectable({
  providedIn: 'root'
})
export class QueryService {

  /**
   * The URL of the backend API endpoint for executing queries
   * This is the endpoint where query objects are sent via HTTP POST
   */
  private apiUrl = 'http://localhost:7070/api/sandbox/query';

  /**
   * Constructor for the QueryService
   *
   * @param loggingService Service for logging status changes and errors
   * @param http Angular's HttpClient for making API requests
   */
  constructor(
    private loggingService: LoggingService,
    private http: HttpClient
  ) { }

  /**
   * Converts a Date object to a UTC ISO string without timezone conversion
   *
   * This utility method:
   * 1. Takes the local date/time values from the input Date object
   * 2. Treats these values as if they were already in UTC
   * 3. Formats them into an ISO string with Z suffix (indicating UTC)
   *
   * @param date The local date object from the calendar
   * @returns A string in the format "YYYY-MM-DDTHH:mm:ss.sssZ"
   */
  private toUtcIsoString(date: Date): string {
    const pad = (num: number) => num.toString().padStart(2, '0');

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
  }

  /**
   * Builds and executes a query remotely, based on the provided search criteria
   *
   * This method:
   * 1. Validates that at least one search criterion is provided
   * 2. Builds the query object using the buildQuery method
   * 3. Sends the query to the backend API via HTTP POST
   * 4. Handles any errors that occur during the API request
   *
   * @param timeRange An array of two Date objects representing the start and end times for temporal filtering
   * @param spatialQuery An object representing the spatial filter (circle, city, or bbox)
   * @returns An Observable that emits the query results from the backend
   * @throws Error if no search criteria are provided
   */
  public buildAndExecuteQuery(
    timeRange: Date[] | undefined,
    spatialQuery: SpatialQuery
  ): Observable<any> {
    if (!timeRange && !spatialQuery) {
      this.loggingService.warn('QueryService', 'Query execution attempted with no criteria.');
      return throwError(() => new Error('No search criteria provided.'));
    }

    const query = this.buildQuery(timeRange, spatialQuery);
    this.loggingService.info('QueryService', 'Executing query', query);

    console.log('Generated Query:', JSON.stringify(query, null, 2));

    const httpOptions = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'accept': 'application/json'
      })
    };

    return this.http.post<any>(this.apiUrl, query, httpOptions).pipe(
      catchError(error => {
        this.loggingService.error('QueryService', 'API request failed', error);
        // Forward the error to the calling component
        return throwError(() => new Error('An error occurred while querying the backend.'));
      })
    );
  }

  /**
   * Constructs the JSON query object for vitrivr-engine backend
   *
   * This method:
   * 1. Creates an empty query structure
   * 2. Adds temporal filters if a time range is provided
   * 3. Adds spatial filters based on the type of spatial query (circle, city, or bbox)
   * 4. Sets up the appropriate output operation based on which filters are active
   *
   * The method handles the construction of different query structures
   * based on the combination of filters that are active.
   *
   * @param timeRange An array of two Date objects representing the start and end times for temporal filtering
   * @param spatialQuery An object representing the spatial filter (circle, city, or bbox)
   * @returns The constructed VitrivrQuery object ready to be sent to the backend
   */
  private buildQuery(
    timeRange: Date[] | undefined,
    spatialQuery: SpatialQuery
  ): VitrivrQuery {

    const query: VitrivrQuery = {
      inputs: {},
      operations: {},
      output: '',
      context: {}
    };

    const hasTimeFilter = timeRange && timeRange.length === 2;
    const hasSpatialFilter = spatialQuery !== null;

    let lastOperation = '';

    if (hasTimeFilter) {
      query.inputs['start_time'] = {
        type: 'DATETIME',
        data: this.toUtcIsoString(timeRange[0]),
        comparison: '>='
      };
      query.inputs['end_time'] = {
        type: 'DATETIME',
        data: this.toUtcIsoString(timeRange[1]),
        comparison: '<='
      };

      query.operations['time_filter_after'] = {
        type: 'RETRIEVER',
        input: 'start_time',
        field: 'lsctimestamp.minuteIdTimestamp'
      };
      query.operations['time_filter_before'] = {
        type: 'RETRIEVER',
        input: 'end_time',
        field: 'lsctimestamp.minuteIdTimestamp'
      };

      query.operations['time_range_filter'] = {
        type: 'BOOLEAN_AND',
        inputs: ['time_filter_after', 'time_filter_before'],
        field: 'lsctimestamp'
      };
      lastOperation = 'time_range_filter';
    }

    if (hasSpatialFilter) {
      switch (spatialQuery.type) {
        case 'circle':
        case 'city':
          query.inputs['center_point'] = {
            type: 'GEOGRAPHY',
            data: spatialQuery.type === 'circle'
              ? `POINT(${spatialQuery.data.center.lng} ${spatialQuery.data.center.lat})`
              : spatialQuery.data.name
          };
          query.inputs['radius'] = {
            type: 'NUMERIC',
            data: spatialQuery.data.radius
          };

          query.operations['spatial_filter'] = {
            type: 'RETRIEVER',
            input: 'center_point',
            field: 'coordinates',
            parameters: {
              operator: 'DWITHIN',
              radiusInput: 'radius',
              latAttribute: 'lat',
              lonAttribute: 'lon'
            }
          };
          break;

        case 'bbox':
          const { northEast, southWest } = spatialQuery.data;

          //numeric inputs for bounds with standard comparisons
          query.inputs['south_lat'] = {
            type: 'NUMERIC',
            data: southWest.lat,
            comparison: '>='
          };
          query.inputs['north_lat'] = {
            type: 'NUMERIC',
            data: northEast.lat,
            comparison: '<='
          };
          query.inputs['west_lon'] = {
            type: 'NUMERIC',
            data: southWest.lng,
            comparison: '>='
          };
          query.inputs['east_lon'] = {
            type: 'NUMERIC',
            data: northEast.lng,
            comparison: '<='
          };

          // Create retrievers for each bound
          query.operations['lat_after_south'] = {
            type: 'RETRIEVER',
            input: 'south_lat',
            field: 'coordinates.lat'
          };
          query.operations['lat_before_north'] = {
            type: 'RETRIEVER',
            input: 'north_lat',
            field: 'coordinates.lat'
          };
          query.operations['lon_after_west'] = {
            type: 'RETRIEVER',
            input: 'west_lon',
            field: 'coordinates.lon'
          };
          query.operations['lon_before_east'] = {
            type: 'RETRIEVER',
            input: 'east_lon',
            field: 'coordinates.lon'
          };

          // Combine all four with AND as the spatial filter
          query.operations['spatial_filter'] = {
            type: 'BOOLEAN_AND',
            inputs: ['lat_after_south', 'lat_before_north', 'lon_after_west', 'lon_before_east'],
            field: 'coordinates'
          };
          break;
      }
      lastOperation = 'spatial_filter';
    }

    // Define Output and Aggregation
    if (hasTimeFilter && hasSpatialFilter) {
      query.operations['final_intersection'] = {
        type: 'AGGREGATOR',
        aggregatorName: 'IntersectionAggregator',
        inputs: ['spatial_filter', 'time_range_filter']
      };
      lastOperation = 'final_intersection';
    }

    // Add metadata lookup transformer
    query.operations['lookup_metadata'] = {
      type: 'TRANSFORMER',
      transformerName: 'MultiFieldLookup',
      input: lastOperation
    };

    query.output = 'lookup_metadata';

    query.context = {
      local: {
        lookup_metadata: {
          fields: 'postgiscoordinates,lsctimestamp'
        }
      },
      global: {}
    };

    return query;
  }
}
