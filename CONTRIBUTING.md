# Documentation Guidelines for dex-cli

## Code Comments Best Practices

### Function Documentation
```python
def process_data(input_data: dict) -> dict:
    """
    Process input data and return transformed result.
    
    Args:
        input_data: Dictionary containing raw data
        
    Returns:
        Dictionary with processed/transformed data
        
    Raises:
        ValueError: If input_data is malformed
        
    Example:
        >>> process_data({"name": "test"})
        {"name": "test", "processed": True}
    """
    # Implementation here
    pass
```

### Module Documentation
```python
"""
Module: data_processor

This module handles data transformation operations including:
- Validation of input structures
- Transformation of data formats
- Error handling and logging

Usage:
    from data_processor import process_data
    result = process_data(raw_input)
"""
```

### Inline Comments
```python
# Calculate checksum before sending to ensure data integrity
checksum = calculate_hash(payload)

# TODO: Replace with async implementation for performance
result = blocking_operation(data)
```

## Type Hints
Always include type hints for:
- Function parameters
- Return values
- Class attributes
- Module-level variables

Example:
```python
from typing import Optional, List, Dict

def fetch_users(
    limit: int = 100,
    offset: int = 0
) -> List[Dict[str, str]]:
    """Fetch users with pagination."""
    pass
```

## Documentation Debt Priority

1. **High Priority** (Add immediately):
   - Public API functions
   - Configuration options
   - CLI command usage

2. **Medium Priority** (Add within sprint):
   - Internal utility functions
   - Data models
   - Error handling patterns

3. **Low Priority** (Add gradually):
   - Private helper functions
   - Test utilities

## Current Status: Code:Comment = 11:1
Target: Improving to 5:1 ratio through above practices.
