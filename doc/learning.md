# LEARNING

```javascript
process.on('uncaughtException', (err) => {
  console.log('Caught exception');
  console.error(err);
});
```
