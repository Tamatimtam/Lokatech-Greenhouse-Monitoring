<!--
Section Naming Convention Update:
- 'Penyemaian' is now referred to as 'Peremajaan'.
- 'Remaja' is now referred to as 'Meja Apung'.
This document reflects these updated names.
-->
# 📊 Greenhouse Monitoring: History Page Implementation

## 🎯 1. Introduction

This document details the implementation of the "Data Riwayat" (History Page) for the Lokatani Greenhouse Monitoring system. This page allows users to visualize and analyze historical sensor data, including temperature, humidity, and light intensity, collected from various sections of the greenhouse: `Peremajaan` (Seedling/Rejuvenation), `Meja Apung` (Floating Table/Young Plants), and `Dewasa` (Mature Plants), as well as overall `Averages`.

**Key Features:**

*   📈 **Multi-Sensor Visualization**: Displays separate, interactive line charts for Temperature, Humidity, and Light Intensity.
*   ⏱️ **Time Range Selection for Charts**: Users can select predefined time ranges for chart display:
    *   **1 Jam (1 Hour)**: Shows data at approximately 1-minute intervals (fetched optimized from backend).
    *   **24 Jam (24 Hours / 1 Day)**: Shows data at approximately 15-minute intervals (downsampled client-side from 1-minute backend data).
    *   **7 Hari (7 Days)**: Shows data at approximately 1-hour intervals (sampled by backend).
    *   **30 Hari (30 Days)**: Shows data at approximately 3-hour intervals (sampled by backend).
*   💡 **Data Insights**: For each sensor type and selected chart range, the page displays:
    *   Minimum value (with section and timestamp).
    *   Maximum value (with section and timestamp).
    *   Overall average value for the period, calculated from the 'averages' data stream.
*   📱 **Responsive Design**: Charts and layout adapt to different screen sizes.
*   🇮🇩 **Localization**: UI elements are primarily in Bahasa Indonesia.
*   🔄 **Dynamic Data Loading**: Data is fetched asynchronously from a backend API, with caching for performance.
*   📄 **Data Export to Excel**: Users can export historical data for selected time ranges (1 Hour, 24 Hours, 7 Days, and 30 Days). Aggregation for export differs from chart display for longer ranges (see section 4).
*   ⚡ **Optimized Data Fetching & Caching**:
    *   **Dual-level server-side caching**: Short-term cache (2min TTL) for real-time data, long-term cache (10min TTL) for historical analysis
    *   **Smart cache selection**: Automatically chooses appropriate cache based on request type
    *   **1-hour optimization**: Fetches only ~70 documents instead of 1500 for 1-hour views (95% reduction)
    *   **Dramatic cost reduction**: 80-95% fewer Firestore reads for repeated requests
    *   **Real-world benefits**: Multiple users can view the same data with minimal additional database costs

---

<details open>
<summary><strong>⚙️ 2. System Architecture & Data Flow</strong></summary>

> The history feature involves several components working together, from data ingestion to frontend display.

```mermaid
sequenceDiagram
    participant User
    participant Browser (Frontend - history.js)
    participant FlaskApp (Backend - routes.py, firestore.py)
    participant Cache (TTLCache on FlaskApp)
    participant FirestoreDB (greenhouse_data collection)
    participant MQTTBroker
    participant SensorSimulator (publishes to MQTT)
    participant DataAggregator (mqtt_to_firestore.py)

    SensorSimulator->>MQTTBroker: Publishes raw sensor data (JSON)
    DataAggregator->>MQTTBroker: Subscribes to sensor data topic
    DataAggregator->>DataAggregator: Aggregates data (1-min intervals, stats)
    DataAggregator->>FirestoreDB: Stores 1-minute aggregated stats (doc ID uses WIB time)

    User->>Browser (Frontend - history.js): Navigates to History Page
    Browser (Frontend - history.js)->>FlaskApp (Backend - routes.py, firestore.py): GET /history/
    FlaskApp (Backend - routes.py, firestore.py)-->>Browser (Frontend - history.js): Serves history.html

    User->>Browser (Frontend - history.js): Selects Time Range (e.g., 7 Days)
    Browser (Frontend - history.js)->>FlaskApp (Backend - routes.py, firestore.py): GET /history/data?days=X or ?range=X
    
    alt Request in Cache?
        FlaskApp (Backend - routes.py, firestore.py) ->> Cache: Check for data
        Cache -->> FlaskApp (Backend - routes.py, firestore.py): Cached data (if available)
        FlaskApp (Backend - routes.py, firestore.py) -->> Browser (Frontend - history.js): Responds with cached JSON data
    else Cache Miss
        FlaskApp (Backend - routes.py, firestore.py) ->> FirestoreDB: Queries 1-min aggregated data (with sampling/optimization)
        FirestoreDB -->> FlaskApp (Backend - routes.py, firestore.py): Returns sampled/optimized 1-min data
        FlaskApp (Backend - routes.py, firestore.py) ->> Cache: Store fetched data
        FlaskApp (Backend - routes.py, firestore.py) -->> Browser (Frontend - history.js): Responds with JSON data (timestamps converted to WIB)
    end

    Browser (Frontend - history.js)->>Browser (Frontend - history.js): Processes data (client-side filtering/downsampling for charts) & renders charts (Chart.js)

    Note over User, Browser (Frontend - history.js): User clicks "Export to Excel"
    Browser (Frontend - history.js)->>FlaskApp (Backend - routes.py, firestore.py): GET /history/export_excel?range=X
    FlaskApp (Backend - routes.py, firestore.py)->>FirestoreDB: Queries 1-min aggregated data
    FirestoreDB-->>FlaskApp (Backend - routes.py, firestore.py): Returns 1-min data
    FlaskApp (Backend - routes.py, firestore.py)->>FlaskApp (Backend - routes.py, firestore.py): Performs specific aggregation for 7/30 day Excel export
    FlaskApp (Backend - routes.py, firestore.py)-->>Browser (Frontend - history.js): Sends Excel file as download
```

<details>
<summary><strong>⚡ 2.1.5. Firestore Read Optimization & Caching Strategy</strong></summary>

> **New Implementation**: To dramatically reduce Firestore costs and improve performance, we've implemented a comprehensive caching strategy.

### 🎓 **Understanding Caching (New Concept Explanation)**

**What is Caching?**
- **Cache**: A temporary storage area that keeps copies of frequently accessed data
- **Cache Hit**: When requested data is found in cache (fast, no database query needed)
- **Cache Miss**: When requested data is not in cache (requires expensive database query)
- **TTL (Time-To-Live)**: How long data stays in cache before it expires and gets removed

**Simple Analogy**: Think of cache like a notepad on your desk where you write down frequently looked-up phone numbers. Instead of searching through the entire phone book every time, you check your notepad first. If the number is there (cache hit), you get it instantly. If not (cache miss), you look it up in the phone book and write it on your notepad for next time.

**Why Caching Matters for Our Greenhouse System:**
- **Before caching**: Every chart view = expensive Firestore query (costs money, takes time)
- **After caching**: First view = Firestore query, subsequent views = instant response from memory
- **Real impact**: If 10 users view 1-hour chart, instead of 10 expensive queries, we do 1 query + 9 instant cache responses

### 📊 **Problem Solved**
Before optimization, the history page was making expensive Firestore queries on every request:
- **1-hour view**: Fetched 1500+ documents, filtered client-side
- **Repeated requests**: No caching, same expensive queries every time
- **Multiple users**: Each user triggered separate expensive queries
- **Time range switching**: Every button click = new expensive query

### 🚀 **Optimization Strategy**

**1. Dual-Level Server-Side Caching (`cachetools.TTLCache`)**

We use two separate cache instances with different TTL (Time-To-Live) values:

```python
# In routes.py
from cachetools import TTLCache, cached
from cachetools.keys import hashkey

# Short-term cache for real-time data (1hour, 1day requests)
history_data_cache_short = TTLCache(maxsize=50, ttl=120)  # 2 minutes

# Long-term cache for historical analysis (7day, 30day requests) 
history_data_cache_long = TTLCache(maxsize=50, ttl=600)   # 10 minutes
```

**2. Smart Cache Selection Logic**

```python
def get_appropriate_cache():
    """
    Automatically selects the right cache based on request parameters
    """
    range_str = request.args.get('range')
    days_str = request.args.get('days')
    
    # Use long-term cache for expensive historical queries
    if range_str in ['7day', '30day'] or (days_str and int(days_str) >= 7):
        return history_data_cache_long  # 10 minutes TTL
    else:
        return history_data_cache_short # 2 minutes TTL
```

**3. 1-Hour Fetch Optimization**

In `firestore.py`, we detect 1-hour requests and fetch only the necessary documents:

```python
if range_specifier == "1hour":
    # Instead of fetching 1500+ docs, fetch only ~70 docs (1 per minute + buffer)
    one_hour_ago_wib = now_wib - datetime.timedelta(hours=1, minutes=10)
    query = db.collection('greenhouse_data') \
              .where('timestamp', '>=', date_limit_utc) \
              .order_by('timestamp', direction=firestore.Query.DESCENDING) \
              .limit(70)  # 95% reduction in document reads!
```

### 🔄 **How Caching Works in Practice**

**Step 1**: User requests data via `/history/data?range=1hour`

**Step 2**: System generates cache key from request parameters
```python
cache_key = hashkey(frozenset(request.args.items()))
```

**Step 3**: Check if data exists in appropriate cache
```python
cache = get_appropriate_cache()  # Selects short or long-term cache

if cache_key in cache:
    print("Cache HIT - returning cached data")
    return cache[cache_key]  # Return immediately, no Firestore query!
```

**Step 4**: If cache miss, fetch from Firestore and store in cache
```python
print("Cache MISS - fetching from Firestore")
data = get_historical_data(...)  # Expensive Firestore query
response = jsonify({'success': True, 'data': data})
cache[cache_key] = response  # Store for future requests
return response
```

### 📈 **Performance Impact**

| Scenario | Before Optimization | After Optimization | Improvement |
|----------|--------------------|--------------------|-------------|
| **1-hour view** | 1500+ document reads | ~70 document reads | **95% reduction** |
| **Repeated requests** | Full query every time | Cache hit (0 reads) | **100% reduction** |
| **Multiple users (same range)** | N × full queries | 1 query + (N-1) cache hits | **80-95% reduction** |
| **Time range switching** | New query each switch | Cached if recently accessed | **Variable reduction** |

### 🎯 **Cache TTL Strategy Explained**

**Why 2 minutes for short-term cache?**
- Real-time data (1hour, 1day) needs to be relatively fresh
- Users expect recent sensor readings to update within a reasonable time
- 2 minutes balances freshness with performance

**Why 10 minutes for long-term cache?**
- Historical analysis data (7day, 30day) doesn't need to be real-time
- These queries are more expensive (sampling across large time ranges)
- 10-minute delay is negligible for analytical purposes

### 🔍 **Monitoring Cache Performance**

New endpoint for monitoring cache effectiveness:

```python
@history.route('/cache_stats')
def cache_stats():
    return jsonify({
        'cache_stats': {
            'short_term_cache': {
                'current_size': len(history_data_cache_short),
                'max_size': 50,
                'ttl_seconds': 120,
                'description': 'For 1hour and 1day requests'
            },
            'long_term_cache': {
                'current_size': len(history_data_cache_long),
                'max_size': 50, 
                'ttl_seconds': 600,
                'description': 'For 7day and 30day requests'
            }
        }
    })
```

**What to Monitor:**
- **Cache sizes**: How many unique requests are being cached
- **TTL effectiveness**: Whether cache settings match your usage patterns
- **Memory usage**: Cache memory consumption (should be minimal for 50 items)

**Cost Benefits You Should Expect:**
- **Firestore read costs**: Reduced proportionally to cache hit rate (typically 80-95% savings)
- **Application responsiveness**: Faster load times for cached requests  
- **Better user experience**: Near-instant responses for repeated requests
- **Reduced server load**: Less CPU time spent on expensive Firestore queries

**Recommended Monitoring Approach:**
```bash
# Check cache statistics via API
curl http://your-domain/history/cache_stats

# Monitor debug logs for cache hits/misses
# Look for: "DEBUG: Cache HIT" vs "DEBUG: Cache MISS" in application logs
```

### ⚙️ **Configuration & Tuning**

**Required Dependencies (`requirements.txt`)**
```
cachetools==5.3.0  # Added for TTL-based server-side caching optimization
```
This dependency was specifically added to support the caching optimization implementation.

Current cache settings (adjustable based on your needs):

```python
# Short-term cache configuration
maxsize=50     # Can store up to 50 different request combinations
ttl=120        # 2 minutes = 120 seconds

# Long-term cache configuration  
maxsize=50     # Can store up to 50 different request combinations
ttl=600        # 10 minutes = 600 seconds
```

**When to adjust settings:**
- **Increase maxsize**: If you have many different request combinations
- **Increase TTL**: If data freshness requirements are more relaxed
- **Decrease TTL**: If you need more real-time data updates

**Files Modified During Optimization Implementation:**
1. `requirements.txt` - Added cachetools dependency
2. `blueprints/history/routes.py` - Added smart caching logic and cache selection
3. `blueprints/history/firestore.py` - Added 1-hour fetch optimization
4. `static/js/history.js` - Updated API calls to trigger backend optimizations

</details>

<details>
<summary><strong>💾 2.2. Data Ingestion & Storage (`mqtt_to_firestore.py`)</strong></summary>

*   **Source:** `Hardware/simulation/mqtt_to_firestore.py` (Data Aggregator).
*   **Process:**
    1.  Subscribes to an MQTT topic (`lokatech/greenhouse/sensors`) where sensor data is published.
    2.  Collects readings over a **1-minute interval**.
    3.  For each section (`peremajaan`, `meja_apung`, `dewasa`) and overall `averages`, calculates statistics (average, min, max, median, count of raw readings within that minute).
    4.  Saves these 1-minute aggregated statistics as a new document in the `greenhouse_data` collection in Firestore.
    5.  Each document ID is a string representation of the WIB timestamp (e.g., "YYYY-MM-DD HH:MM:SS.sss"), and the document contains a `timestamp` field with the UTC datetime object.

</details>

<details>
<summary><strong>⚙️ 2.3. Backend (Flask Application)</strong></summary>

*   **Relevant Files:**
    *   `blueprints/history/routes.py`: Defines API endpoints, caching, and page rendering logic.
    *   `blueprints/history/firestore.py`: Handles interaction with Firestore for fetching data.

### 🏗️ **Core Implementation Architecture**

**Caching Dependencies Setup (`requirements.txt`)**
```
cachetools==5.3.0  # For TTL-based server-side caching
```

**Import Structure in `routes.py`**
```python
from cachetools import TTLCache, cached
from cachetools.keys import hashkey
```

### 📋 **API Endpoints Overview**

<details>
<summary><strong>🔍 API Endpoint: `GET /history/data` (Main Data Endpoint)</strong></summary>

**Purpose:** Provides cached historical sensor data to the frontend for chart display.

**Full Implementation Flow:**

```python
@history.route('/data')
@isloggedin
def history_data():
    """API endpoint to get historical data (now with smart caching)"""
    print(f"DEBUG: /history/data called with args: {request.args}")
    
    # Step 1: Generate unique cache key from all request parameters
    cache_key = hashkey(frozenset(request.args.items()))
    
    # Step 2: Determine which cache to use (smart selection)
    cache = get_appropriate_cache()
    
    # Step 3: Check cache first (CACHE HIT = immediate return)
    if cache_key in cache:
        print(f"DEBUG: Cache HIT for {request.args}")
        return cache[cache_key]  # Return cached response instantly
    
    # Step 4: Cache miss - fetch from expensive Firestore query
    print(f"DEBUG: Cache MISS for {request.args} - fetching from Firestore")
    
    # Step 5: Extract and process parameters
    section = request.args.get('section', None)
    days_str = request.args.get('days')
    range_str = request.args.get('range')  # New optimization parameter
    data_type = request.args.get('type', None)
    
    days_to_pass = 7  # Default
    if days_str:
        days_to_pass = int(days_str)
    
    # Step 6: Call optimized Firestore function
    data = get_historical_data(
        section=section, 
        days=days_to_pass, 
        data_type=data_type, 
        range_specifier=range_str  # Enables 1-hour optimization
    )
    
    # Step 7: Create response and store in cache
    response = jsonify({'success': True, 'data': data})
    cache[cache_key] = response  # Store for future identical requests
    
    return response
```

**Query Parameters:**
- `days` (integer, optional): Number of past days (used if `range` not specified)
- `range` (string, optional): **NEW** - Predefined range (`"1hour"`, `"1day"`, `"7day"`, `"30day"`)
- `section` (string, optional): Filter by specific section
- `type` (string, optional): Filter by specific data type

**Cache Selection Logic:**
```python
def get_appropriate_cache():
    """Smart cache selection based on request characteristics"""
    range_str = request.args.get('range')
    days_str = request.args.get('days')
    
    # Long-term cache (10min TTL) for expensive historical queries
    if range_str in ['7day', '30day'] or (days_str and int(days_str) >= 7):
        print(f"DEBUG: Using LONG-TERM cache (10min TTL)")
        return history_data_cache_long
    else:
        print(f"DEBUG: Using SHORT-TERM cache (2min TTL)")
        return history_data_cache_short
```

</details>

<details>
<summary><strong>⚡ Firestore Optimization in `get_historical_data()` (firestore.py)</strong></summary>

**The 1-Hour Optimization - Key Implementation:**

```python
def get_historical_data(section=None, days=7, data_type=None, range_specifier=None):
    """
    Retrieve historical data with smart sampling and 1-hour optimization
    """
    db = get_firestore_db()
    if not db: return []
    
    try:
        now_wib = datetime.datetime.now(wib_timezone)
        start_date_wib = now_wib - datetime.timedelta(days=days)
        results = []
        
        # *** KEY OPTIMIZATION: 1-hour specific handling ***
        if range_specifier == "1hour":
            print(f"DEBUG: 1-hour optimization - fetching only ~70 docs instead of 1500+")
            
            # Only look back 1 hour + 10 minute buffer
            one_hour_ago_wib = now_wib - datetime.timedelta(hours=1, minutes=10)
            date_limit_utc = one_hour_ago_wib.astimezone(datetime.timezone.utc)
            
            # Optimized query: LIMIT 70 instead of 1500+
            query = db.collection('greenhouse_data') \
                      .where('timestamp', '>=', date_limit_utc) \
                      .order_by('timestamp', direction=firestore.Query.DESCENDING) \
                      .limit(70)  # *** 95% REDUCTION IN READS ***
            
            docs_list = list(query.stream())
            docs_list.reverse()  # Ascending order for processing
            
            # Process the ~70 documents (instead of 1500+)
            for doc in docs_list:
                # ... document processing logic ...
                
        elif days <= 1:  # Standard 1-day handling
            print(f"DEBUG: Standard 1-day query - up to 1500 docs")
            # ... existing logic for 1-day queries ...
            
        else:  # Smart sampling for 7+ day ranges
            print(f"DEBUG: Smart sampling for {days} days")
            # ... existing sampling logic ...
            
        return results
        
    except Exception as e:
        print(f"Error in optimized historical data retrieval: {e}")
        return []
```

**Why This Optimization Matters:**

| Request Type | Before | After | Savings |
|-------------|--------|--------|---------|
| 1-hour view | 1500+ docs | ~70 docs | **95% fewer reads** |
| Cache hit (any) | Full query | 0 docs | **100% fewer reads** |

</details>

<details>
<summary><strong>📊 Other API Endpoints</strong></summary>

**`GET /history/latest`** - Most recent data point
```python
@history.route('/latest')
@isloggedin
def latest_data():
    """API endpoint to get most recent data"""
    data = get_latest_data()  # Single document fetch
    return jsonify({'success': True, 'data': data})
```

**`GET /history/cache_stats`** - Cache monitoring (NEW)
```python
@history.route('/cache_stats')
@isloggedin  
def cache_stats():
    """Monitor cache performance and size"""
    return jsonify({
        'success': True,
        'cache_stats': {
            'short_term_cache': {
                'current_size': len(history_data_cache_short),
                'max_size': history_data_cache_short.maxsize,
                'ttl_seconds': history_data_cache_short.ttl,
                'description': 'For 1hour and 1day requests'
            },
            'long_term_cache': {
                'current_size': len(history_data_cache_long),
                'max_size': history_data_cache_long.maxsize, 
                'ttl_seconds': history_data_cache_long.ttl,
                'description': 'For 7day and 30day requests'
            }
        }
    })
```

</details>

### 🔧 **Cache Configuration Details**

**Cache Instance Creation:**
```python
# At module level in routes.py
history_data_cache_short = TTLCache(maxsize=50, ttl=120)  # 2 minutes
history_data_cache_long = TTLCache(maxsize=50, ttl=600)   # 10 minutes
```

**Parameters Explained:**
- `maxsize=50`: Can cache up to 50 different request combinations
- `ttl=120/600`: Time-to-live in seconds before cache expires
- **Automatic cleanup**: Old entries automatically removed when TTL expires

**Cache Key Generation:**
```python
cache_key = hashkey(frozenset(request.args.items()))
```
- Creates unique key from all request parameters
- Same parameters = same cache key = cache hit
- Different parameters = different cache key = separate cache entry

</details>

<details>
<summary><strong>🖥️ 2.3. Frontend (Browser)</strong></summary>

*   **Relevant Files:**
    *   `templates/history.html`: Main HTML structure.
    *   `static/js/history.js`: Core JavaScript logic for charts and data display.
    *   `static/js/history_export.js`: Handles Excel export button interactions.
    *   `static/css/history.css`: Page-specific styles.
*   **Process:**
    1.  **Page Load & Initialization (`history.js`):** Sets up UI, Chart.js instances, and triggers initial data load (default: 24 Hours / "1day" range).
    2.  **Data Fetching (`loadHistoricalData`):**
        *   Requests data from `/history/data`.
        *   For "1hour" range, sends `range=1hour` parameter to the API.
        *   For other ranges, sends `days=X` parameter.
    3.  **Data Processing for Charts (`processSensorData`):**
        *   **1 Hour Chart:** Receives optimized data (approx. 60-70 points) from the backend. Client-side filters this to the exact last 60 minutes. Uses these 1-minute interval points.
        *   **24 Hour (1 Day) Chart:** Receives up to 1500 1-minute interval data points from the backend. Client-side downsamples this to approximately 15-minute intervals for chart display.
        *   **7 Day Chart:** Uses the backend-provided sampled data (approx. 1-hour intervals).
        *   **30 Day Chart:** Uses the backend-provided sampled data (approx. 3-hour intervals).
        *   For all ranges, ensures data points corresponding to true Min/Max values (for insights) are included in the chart data.
        *   Calculates insights (min, max, overall average from the 'averages' stream).
    4.  **Chart Rendering & Insight Display:** Updates Chart.js instances and insight display elements.

</details>
</details>

<details>
<summary><strong>📜 3. Detailed Frontend Implementation (`static/js/history.js`)</strong></summary>

<details>
<summary><strong>🧩 3.1. Core Components & Variables</strong></summary>

*   **Chart Instances:** `temperatureChart`, `humidityChart`, `lightChart`.
*   **`currentSelectedRange`:** Tracks active time range (e.g., "1hour", "1day", "7day", "30day").
*   **`chartColors`:** Maps section names (`dewasa`, `meja_apung`, `peremajaan`, `averages`) to chart line colors.

</details>

<details>
<summary><strong>🚀 3.2. Initialization (`DOMContentLoaded`)</strong></summary>

*   `setupTimeRangeButtons()`: Attaches listeners to time range buttons.
*   `initTemperatureChart()`, `initHumidityChart()`, `initLightChart()`: Initializes Chart.js instances.
*   `initScrollAnimations()`: Sets up animations for cards appearing on scroll.
*   `loadHistoricalData(currentSelectedRange)`: Initiates the first data load (default "1day").

</details>

<details>
<summary><strong>🔄 3.3. Data Loading and Orchestration (`loadHistoricalData`)</strong></summary>

*   Manages loading indicators and user feedback.
*   **Optimized API calls** based on selected time range:
    *   For **"1hour"**: Sends `range=1hour` parameter → Triggers backend 1-hour optimization (95% fewer Firestore reads)
    *   For **"1day"**: Sends `days=1` parameter → Uses standard caching with short-term TTL (2 minutes)
    *   For **"7day", "30day"**: Sends `range=7day` or `range=30day` → Uses long-term cache TTL (10 minutes)
*   **Cache-aware frontend**: Takes advantage of backend caching - repeated requests return instantly from cache.
*   Calls `processSensorData`, chart update functions, and insight display functions for each sensor type.

**Implementation Detail:**
```javascript
function loadHistoricalData(selectedRange) {
    showLoadingState();
    
    let url = '/history/data';
    
    // Smart parameter selection to trigger backend optimizations
    if (selectedRange === '1hour') {
        url += '?range=1hour';  // Triggers 1-hour optimization
    } else if (selectedRange === '1day') {
        url += '?days=1';       // Uses short-term cache
    } else if (selectedRange === '7day') {
        url += '?range=7day';   // Uses long-term cache
    } else if (selectedRange === '30day') {
        url += '?range=30day';  // Uses long-term cache
    }
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            // Process cached or fresh data from backend
            // User experience is the same, but performance is dramatically improved
        });
}
```

</details>

<details>
<summary><strong>🔧 3.4. Data Processing for Charts (`processSensorData`)</strong></summary>

This generic function transforms API data for charting and insights.

*   **Parameters:** `apiData` (array from backend), `selectedRange` (string), `sensorType` (string: 'temps', 'humidities', 'lights').
*   **Key Steps:**
    1.  **Data for Insight Calculation:**
        *   For "1hour" range: Uses data from the last 60 minutes (client-side filtered from the `range=1hour` API response).
        *   For other ranges: Uses the full data provided by the backend for that range.
        *   This subset is used to find the true min/max values for the insight boxes.
    2.  **Data for Chart Display Points (`dataForChartDisplayPoints`):**
        *   **"1hour":** Uses the client-side filtered data (last 60 minutes from the optimized API response, effectively 1-minute intervals).
        *   **"1day":** Downsamples the full day of 1-minute data (up to 1500 points from backend) to approximately 15-minute intervals.
        *   **"7day":** Uses the data directly from the backend (which was sampled to approx. 1-hour intervals).
        *   **"30day":** Uses the data directly from the backend (which was sampled to approx. 3-hour intervals).
    3.  **Min/Max Point Inclusion:** Ensures that the specific data points representing the true minimum and maximum values (for insights) are included in `dataForChartDisplayPoints` to be plotted. This makes insights visually verifiable.
    4.  **Chart.js Formatting:** Transforms `dataForChartDisplayPoints` into `{x: DateObject, y: value}` format for each section.
*   **Return Value:** `{ chartData, insightsData }`.

</details>

<details>
<summary><strong>📊 3.5. Chart Rendering (`updateGenericChart`)</strong></summary>

*   Updates the Chart.js instance with new data.
*   Sets dataset properties (labels, colors).
*   Adjusts point radius based on `selectedRange` (smaller points for longer ranges).
*   Configures X-axis time scale units and formats dynamically based on `selectedRange` for optimal readability (e.g., 'minute' for 1hour, 'hour' for 1day, 'day' for 7/30day).

</details>

<details>
<summary><strong>💡 3.6. Insights Display (`updateGenericInsights`)</strong></summary>

*   Populates HTML elements with min, max, and average values.
*   Includes section names (e.g., "Meja Apung") and timestamps, formatted for readability.
*   Uses `formatSectionNameForDisplay` for correct display of "Meja Apung" and "Peremajaan".

</details>

<details>
<summary><strong>💬 3.7. UI Feedback</strong></summary>

*   Functions like `showLoadingState`, `hideLoadingState`, `showErrorState`, and `checkAndShowNoDataError` manage user feedback during data operations.
*   Scroll animations for cards (`initScrollAnimations`).

</details>
</details>

<details>
<summary><strong>📄 4. Excel Data Export Feature</strong></summary>

This section details the functionality for exporting historical sensor data to Microsoft Excel (`.xlsx`) format.

<details>
<summary><strong>✨ 4.1. Overview</strong></summary>

Dedicated buttons allow users to export data. Aggregation for export is distinct from chart display for longer ranges to provide comprehensive summaries.

</details>

<details>
<summary><strong>🗓️ 4.2. Available Export Ranges & Data Aggregation for Excel</strong></summary>

*   **Export 1 Jam:**
    *   **Data:** Sensor data from the **last one hour**.
    *   **Interval:** Original 1-minute aggregated data from Firestore.
    *   **Aggregation (Backend):** None beyond the initial 1-minute aggregation by `mqtt_to_firestore.py`.
*   **Export 1 Hari:**
    *   **Data:** Sensor data from the **last 24 hours**.
    *   **Interval:** Original 1-minute aggregated data from Firestore.
    *   **Aggregation (Backend):** None beyond the initial 1-minute aggregation.
*   **Export 1 Minggu (7 Days):**
    *   **Data:** Sensor data for the **last 7 days**.
    *   **Interval:** Data is **aggregated by the backend into 10-minute intervals** for the Excel file.
    *   **Aggregation (Backend):** Average, Minimum, Maximum, and total Count (of underlying 1-minute records) are calculated for each 10-minute interval. Median is **NOT** calculated for this export range.
*   **Export 30 Hari:**
    *   **Data:** Sensor data for the **last 30 days**.
    *   **Interval:** Data is **aggregated by the backend into hourly intervals** for the Excel file.
    *   **Aggregation (Backend):** Average, Minimum, Maximum, and total Count (of underlying 1-minute records) are calculated for each hourly interval. Median is **NOT** calculated for this export range.

</details>

<details>
<summary><strong>🖱️ 4.3. How to Use</strong></summary>

1.  Navigate to the "Riwayat Data" page.
2.  Under "Ekspor Data ke Excel", click the desired export button (e.g., "Export 1 Jam", "Export 1 Minggu").
3.  The browser will download the generated Excel file.

</details>

<details>
<summary><strong>📋 4.4. Excel File Structure and Column Explanation</strong></summary>

| Column Header     | Description                                                                                                                                                              | Data Type     | Notes                                                                                                                                       |
| :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------------------ |
| **Timestamp (WIB)** | The date and time (WIB, UTC+7). For 1-hour/1-day exports, it's the timestamp of the 1-minute aggregated record. For 7-day/30-day exports, it's the start of the 10-minute/hourly aggregation interval. | Date/Time     |                                                                                                                                             |
| **Section**         | Greenhouse section: `Dewasa`, `Meja Apung`, `Peremajaan`, or `Averages`.                                                                                                | Text          |                                                                                                                                             |
| **Sensor Type**     | `Suhu` (Temperature), `Kelembaban` (Humidity), or `Intensitas Cahaya` (Light Intensity).                                                                                 | Text          |                                                                                                                                             |
| **Average**         | For 1-hour/1-day exports: the 'avg' from the 1-minute Firestore record. For 7-day/30-day exports: the calculated average over the 10-minute/hourly interval.             | Number        | Units: Suhu (°C), Kelembaban (%), Intensitas Cahaya (lux).                                                                    |
| **Min**             | For 1-hour/1-day exports: the 'min' from the 1-minute Firestore record. For 7-day/30-day exports: the minimum 'min' observed among the 1-minute records within the interval. | Number        | Units match sensor type.                                                                                                                |
| **Max**             | For 1-hour/1-day exports: the 'max' from the 1-minute Firestore record. For 7-day/30-day exports: the maximum 'max' observed among the 1-minute records within the interval. | Number        | Units match sensor type.                                                                                                                |
| **Median**          | For 1-hour/1-day exports: the 'median' from the 1-minute Firestore record. **BLANK** for 7-day/30-day exports.                                                          | Number        |                                                                                                                                             |
| **Count**           | For 1-hour/1-day exports: the 'count' from the 1-minute Firestore record (number of raw readings in that minute). For 7-day/30-day exports: the sum of 'counts' from all 1-minute Firestore records aggregated into that 10-minute/hourly interval. | Integer       | Reflects data density.                                                                                                                                             |

</details>

<details>
<summary><strong>💻 4.5. Technical Implementation Details for Export</strong></summary>

*   **Backend Endpoint:** `GET /history/export_excel` (in `blueprints/history/routes.py`).
    *   Accepts `range` query parameter ('1hour', '1day', '7day', '30day').
    *   Fetches 1-minute aggregated data using `get_historical_data`.
    *   For `1hour` and `1day` ranges, it filters the raw 1-minute data to the specified period.
    *   For `7day` range, it performs aggregation into 10-minute intervals (calculating avg, min, max, sum of counts).
    *   For `30day` range, it performs aggregation into hourly intervals (calculating avg, min, max, sum of counts).
    *   Uses `openpyxl` library to create the Excel (`.xlsx`) file in memory.
    *   Sends the Excel file as a downloadable attachment.
*   **Frontend Interaction:** `static/js/history_export.js`.
    *   Attaches event listeners to the export buttons.
    *   On button click, constructs the URL (e.g., `/history/export_excel?range=7day`).
    *   Uses `fetch` to request the Excel file from the backend.
    *   Handles the response: if successful, initiates file download; if error, shows an alert.
    *   Provides user feedback (loading state on button).

</details>
</details>

<details>
<summary><strong>🚀 5. Future Considerations / Potential Enhancements</strong></summary>

*   **Per-Chart Loading/Error States:** Enhance UX with individual loading indicators and error messages for each chart.
*   **Custom Date Range Picker:** Allow users to select arbitrary date/time ranges for chart display and export.
*   **Advanced Export Options:**
    *   Option to choose raw vs. aggregated data for longer export ranges.
    *   CSV export option.
*   **Performance Optimization:** For very large datasets or extremely long ranges, further optimize backend queries or consider pre-aggregated summary collections in Firestore.
*   **Real-time Updates:** Consider integrating WebSocket updates for the "1 Hour" chart if near real-time display is critical, though current polling with caching is efficient.

</details>

---

*This documentation provides a comprehensive guide to the current history page implementation.*

<style>
/* Add some styling for better drawer appearance */
details {
margin: 1rem 0;
padding: 0.5rem;
border: 1px solid #e0e0e0;
border-radius: 8px;
background-color: #fafafa;
}

details[open] {
background-color: #ffffff;
box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

summary {
cursor: pointer;
padding: 0.5rem;
margin: -0.5rem; /* Counteract padding of details */
border-radius: 4px;
/* background-color: #f5f5f5; */ /* Slightly lighter for summary */
font-weight: 600;
transition: background-color 0.2s ease;
list-style-position: inside; /* Keeps marker flush with text */
display: list-item; /* Ensures marker is shown */
}

summary:hover {
background-color: #e8e8e8;
}

details[open] > summary {
margin-bottom: 1rem;
border-bottom: 1px solid #e0e0e0;
}

/* Nested details styling */
details details {
margin-left: 1rem;
border-left: 3px solid #007acc; /* Accent color for nested details */
border-radius: 0 4px 4px 0; /* Rounded corners on one side */
background-color: #f9f9f9;
}

details details summary {
background-color: #f0f8ff; /* Lighter blue for nested summary */
font-weight: 500;
}

details details[open] summary {
background-color: #e6f3ff;
}

/* Ensure proper spacing for content within details */
details > *:not(summary) {
margin-top: 0.5rem;
}
</style>
