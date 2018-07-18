import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

import colors from '../src/utils/colors';
colors.enabled = true;
