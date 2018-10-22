import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as deepEqualInAnyOrder from 'deep-equal-in-any-order';

chai.use(chaiAsPromised);
chai.use(deepEqualInAnyOrder);

import colors from '../src/utils/colors';
colors.enabled = true;
