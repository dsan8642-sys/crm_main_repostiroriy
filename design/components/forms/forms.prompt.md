**Form controls** — labelled inputs, selects, toggles and choice controls that make up SwimCRM's data-entry forms (client cards, session editors, notification templates, receipt uploads).

```jsx
<Input label="Telefon rodziny" prefix="+48" required />
<Input label="Kwota" suffix="zł" size="sm" />
<Select label="Grupa"><option>Delfiny</option></Select>
<Textarea label="Komentarz trenera" rows={3} />
<Checkbox label="Zaznacz wszystkich" indeterminate onChange={…} />
<Radio name="status" label="Obecny" checked />
<Switch label="Powiadomienia SMS" checked />
<IconButton label="Edytuj"><PencilIcon/></IconButton>
```

All controls: `sm | md | lg` where sizing applies; `error` prop paints a red border + ring; labels/hints are short Polish phrases. Money and numeric fields use the `suffix="zł"` / mono family. Switch is reserved for settings & consents, Checkbox for multi-select and table select-all.
