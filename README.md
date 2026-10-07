# node-red-contrib-price-timer

A Node-RED node that plans and controls your energy consumption based on hourly spot prices. Turn on your devices when the electricity is cheapest!

## Key Features

*   **Price-based Scheduling**: Automatically finds the cheapest hours to run your appliances.
*   **Demand Hours**: Specify how many hours your device needs to run per day.
*   **Time Span**: Limit those hours to a part of the day, such as the 2 cheapest hours between 08:00 and 16:00. Control output can be limited to that span so several nodes can share one load, and can send the off-value once when the span ends.
*   **Tomorrow Prices**: Optional next-day series for overnight spans, so hours after midnight use tomorrow's prices up to 24 hours ahead.
*   **Price Cap**: Set a maximum price you're willing to pay. The device won't run above this price.
*   **Price Level**: If the price stays at or below a level for longer than the requested hours, the device runs for that whole stretch.
*   **Minimum Run Hours**: Ensures your device runs for a minimum number of hours, even if the price is above the cap.
*   **Flexible Control**: Outputs simple on/off commands that can be used with any device control node (e.g., MQTT, Home Assistant, etc.).
*   **Informative Output**: Provides a detailed schedule and cost information for monitoring and logging.

## Installation

You can install this node directly from the Node-RED Palette Manager.

1.  Go to `Menu -> Manage palette`.
2.  Click on the `Install` tab.
3.  Search for `node-red-contrib-price-timer`.
4.  Click `install`.

Alternatively, you can install it via npm in your Node-RED user directory (typically `~/.node-red`):
```bash
npm install node-red-contrib-price-timer
```

## Local development

A Docker Compose setup runs Node-RED with this repository mounted live. It is an **unauthenticated local sandbox**: do not expose the ports on a network, and do not store real home-automation credentials in it. The editor has no password. A credential encryption secret is generated on first start under `docker/data/` and is not committed to git.

```bash
docker compose up --build
```

Then open http://localhost:1880. The first start loads a sample flow on the **price-timer dev** tab. Click the inject node to run `price-timer`. Ports are bound to `127.0.0.1` only.

Edits to `price-timer.js` and `price-timer.html` restart Node-RED automatically. Refresh the editor after a restart so it reloads the node definition. Flows and other runtime data stay in `docker/data/`. The Node.js inspector listens on `127.0.0.1:9229`.

`msg.prices` can be a numeric array, or an object with a `spotprice` array. The array covers one 24-hour day at any resolution (24 samples = hourly, 96 samples = every 15 minutes). **Hours** and **Min. hours** are durations in hours.

## Configuration

The `price-timer` node has the following configuration properties:

*   **Name**: A descriptive name for the node in your flow.
*   **Prices**: A 24-hour price series of any length (starting from 00:00). This is typically passed in via `msg.prices`.
*   **Topic**: The topic for the output message (e.g., `myhome/heating`). A value entered here overrides `msg.topic`. Leave empty to use `msg.topic`.
*   **Hours**: The number of hours you want the connected device to be active (wall-clock hours, independent of sample resolution). Leave empty to use `msg.hours`. If both are set, the message value is used.
*   **Time span**: Only choose active hours inside this range of the price day, for example `08:00-16:00`. The end time is exclusive, so that example covers 08:00 up to 16:00. A range that passes midnight, such as `22:00-06:00`, is allowed. Leave empty to use the full day, or `msg.timeSpan`. If both are set, the message value is used. Hours, the price cap, the price level, and Min. hours then apply only inside the range.
*   **Only during span**: Send the control output only while the current time is inside Time span. Outside the span, that output sends nothing. Use this when two or more price-timer nodes control the same load, so a node does not turn the load off during another node's span.
*   **Stop when span ends**: On the first message after Time span ends, send the Off-value. Later messages outside the span send nothing when Only during span is enabled. Use this when spans do not meet, so the load is turned off in the gap. Leave it off when one span starts as the other ends.
*   **On-value**: The value to send when the device should turn on (e.g., `on`, `true`, `1`). Leave empty to use `msg.startValue`. If both are set, the message value is used.
*   **Off-value**: The value to send when the device should turn off (e.g., `off`, `false`, `0`). Leave empty to use `msg.stopValue`. If both are set, the message value is used.
*   **Price cap**: The maximum price at which the device is allowed to run, in the same unit as the price series. A value entered here overrides `msg.priceCap`. Leave empty to use `msg.priceCap`, or for no cap if the message omits it.
*   **Price level**: If the price stays at or below this level for longer than Hours, the device runs for the whole time it is at or below the level. A value entered here overrides `msg.priceLevel`. Leave empty to use `msg.priceLevel`, or to only run the cheapest Hours if the message omits it. Same unit as the price series.
*   **Min. hours**: The minimum number of hours the device must run, overriding the price cap if necessary. Leave empty to use `msg.minHours`. If both are set, the message value is used.

## Inputs

The node is triggered by an incoming message. The following properties on the `msg` object are used:

*   `msg.prices` (Array | Object): **Required.** A 24-hour price series as a numeric array, or `{ spotprice: [...] }` with that series. Length may be 24 (hourly), 96 (15 minutes), or any other count spanning the same day.
*   `msg.hours` (Number): *Optional.* Used when Hours on the node is empty. If both are set, the message value is used.
*   `msg.timeSpan` (String): *Optional.* Used when Time span on the node is empty. A range such as `08:00-16:00` limits the schedule to samples fully inside that part of the day. If both are set, the message value is used. If both are empty, the whole day is used.
*   `msg.tomorrowPrices` (Array | Object): *Optional.* Next-day price series in the same shape and length as `msg.prices`. Used only when Time span crosses midnight. Samples that have already ended today take their price from this series when the next occurrence starts within 24 hours. The node remembers the series and, after midnight, compares it to the new `msg.prices`. A mismatch is logged as an error and the newest prices are used.
*   `msg.priceCap` (Number): *Optional.* Used when Price cap on the node is empty. Same unit as the price series. A Price cap entered on the node overrides this. If both omit it, there is no cap.
*   `msg.priceLevel` (Number): *Optional.* Used when Price level on the node is empty. If the series is at or below this level for longer than the requested hours, every such sample is active. A Price level entered on the node overrides this. If both omit it, the schedule is the cheapest hours only.
*   `msg.minHours` (Number): *Optional.* Used when Min. hours on the node is empty. If both are set, the message value is used.
*   `msg.topic` (String): *Optional.* Used when Topic on the node is empty. A Topic entered on the node overrides this.
*   `msg.startValue` (*): *Optional.* Used when On-value on the node is empty. If both are set, the message value is used.
*   `msg.stopValue` (*): *Optional.* Used when Off-value on the node is empty. If both are set, the message value is used.

## Outputs

The node has two outputs:

1.  **Information Output**: The first output sends a message containing detailed information about the schedule, including:
    *   `msg.payload.prices`: The prices used for calculation.
    *   `msg.payload.tomorrowPrices`: The tomorrow series when an overnight span used it, or `null` otherwise.
    *   `msg.payload.nbrOfHours`: The target number of active hours.
    *   `msg.payload.timeSpan`: The active range, such as `08:00-16:00`, or `null` when the whole day is used. Hours below the price cap and price level are counted inside this range.
    *   `msg.payload.slots`: Indexes into the price series for periods when the device will be active.
    *   `msg.payload.hoursBelowPriceCap`: How many hours of the day are at or below the price cap.
    *   `msg.payload.priceLevel`: The price level used, or `null` when disabled.
    *   `msg.payload.hoursBelowPriceLevel`: How many hours are at or below the price level, or `null` when disabled.
    *   `msg.payload.extended`: `true` when the schedule was lengthened to cover the whole stretch at or below the price level.
    *   `msg.payload.startStop`: A detailed schedule with start and end times.

2.  **Control Output**: The second output sends a message to control your device.
    *   `msg.payload`: Contains the On-value or Off-value (from the message or the node configuration) depending on the current time and schedule. With Only during span, no message is sent while the current time is outside Time span. With Stop when span ends, the first message after the span ends sends the Off-value.
    *   `msg.topic`: The topic entered on the node, or from the message when that field is empty.

## Example Flow

Import `examples/time-span.json` from **Menu → Import**, or from **Import → Examples** after the node is installed. Click **sample prices**. The same 24-hour series goes to three nodes:

*   **whole day** plans 2 hours for `myhome/washing-machine` and runs 03:00–05:00.
*   **08:00-16:00** and **16:00-08:00** both use topic `myhome/boiler`, which overrides `msg.topic`. Each has **Only during span** enabled, and both control outputs join one debug node. The day node runs 11:00–12:00 and 14:00–15:00. The night node uses `msg.tomorrowPrices` for hours after midnight when those samples have already ended today, so evening planning can pick tomorrow morning's cheapest hours. Outside its own span, a node sends nothing on output 2, so the two schedules do not turn each other off.

**Stop when span ends** is off in the example because 16:00 and 08:00 meet. Enable it when there is a gap between spans, so the load receives one Off-value as a span finishes. Output 1 is the schedule. Output 2 is `on` or `off` for the current time.

## Author

Niklas Ekström

## License

MIT
