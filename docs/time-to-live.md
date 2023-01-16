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

With this example configuration all `Delivery` objects will be deleted automatically if they have a
`completionDate` date that is at least 180 days in the past. Elements where `completionDate` is not
filled are not deleted.

The `dateField` can be either a `DateTime`, an `OffsetDateTime` or a `LocalDate`. For `LocalDate` an
element will be deleted once the expiration date has passed in the westernmost timezone which means
it has passed everywhere on earth.

Any edges from relations including the deleted elements will also be deleted.

The actual cleanup must be triggered manually by calling the executeTTLCleanup method on the
`Project`.

## Cascading Delete

If the type of a TTL configuration has relations annotated with `@relation(onDelete=CASCADE)`, this
cascading delete operation will also be performed when the objects are deleted due to TTL.

`@relation(onDelete=RESTRIICT)` currently does not work well with TTL because as soon as one item in
a batch cannot be deleted, the whole operation is cancelled.

You can configure some relation paths as cascading in the TTL configuration, overriding the regular
model configuration:

```json
{
    "timeToLive": [
        {
            "typeName": "Delivery",
            // ...
            "cascadeFields": ["handlingUnits", "handlingUnits.innerHandlingUnits"]
        }
    ]
}
```

This will only have an effect when the objects are deleted by TTL.
