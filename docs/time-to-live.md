# Time-to-live

Cruddl allow you to define a time-to-live for rootEntities.

This can be done in a YAML or JSON file:

```json
{
    "timeToLive": [
        {
            "typeName": "Delivery",
            "expireAfterDays": 180,
            "dateField": "completionDate"
        }
    ]
}
```

With this example configuration all `Delivery` objects will be deleted automatically if they have a `completionDate`
date that is at least 180 days in the past. Elements where `completionDate` is not filled are not deleted.

The `dateField` can be either a `DateTime`, an `OffsetDateTime` or a `LocalDate`. For `LocalDate` an element will be
deleted once the expiration date has passed in the westernmost timezone which means it has passed everywhere on earth.

Any edges from relations including the deleted elements will also be deleted.

The actual cleanup must be triggered manually by calling the executeTTLCleanup method on the `Project`.
