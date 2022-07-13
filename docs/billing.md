#Billing guide Cruddl can be configured to log the creation of business objects for specific type. This can be used for
applications where a customer is billed based on the number of created business objects.

## Configuration

A cruddl project contains GraphQL schema files and metadata (json/yaml) files. BillingEntities are defined in metadata
files within the `billing` object as follows:

```json
{
    "billing": {
        "billingEntities": [
            {
                "typeName": "Order",
                "keyFieldName": "orderNumber"
            }
        ]
    }
}
```

A BillingEntity is defined with a `typeName` and a `keyFieldName`. If no `keyFieldName` is supplied, the `@key` field of
the type is used.

Only RootEntities can be defined as BillingEntities.

## How it works

Whenever a _create_ mutation is called for a rootEntity that is configured as BillingEntity, a new entry in the
`billingEntities` database collection is created. An entry is also created if the key field is changed for a rootEntity
that is configured as BillingEntity.

In both cases, if there already is an entry with the same key, no billing entry is created.

##Logged Entries

A billing entry has the following structure:

```json
{
    "key": "000006",
    "type": "Order",
    "isExported": false,
    "isConfirmedForExport": false,
    "createdAt": "2020-04-21T14:58:46.394Z",
    "updatedAt": "2020-04-21T14:58:46.394Z"
}
```

Cruddl does not perform any clean up, so a service that exports these entries should also delete old entries that are no
longer needed.

## Confirm Billing

In some cases, the billing entries should not be exported before a specific event in the business process occurs. For
these cases, cruddl provides a `confirmBillingForOrder` mutation that sets the `isConfirmedForExport` flag and the
`confirmedForExportTimestamp`.
